import json
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional

import serial
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Device as DeviceModel, VFDReading as VFDReadingModel

FIELD_MAP = {
    "frequency": "frequency",
    "freq": "frequency",
    "speed": "speed",
    "rpm": "speed",
    "current": "current",
    "voltage": "voltage",
    "power": "power",
    "torque": "torque",
    "status": "status",
    "run_status": "status",
    "fault_code": "fault_code",
    "faultcode": "fault_code",
    "fault": "fault_code",
}


def calculate_crc(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc


def build_read_request(slave_id: int, address: int, quantity: int = 1) -> bytes:
    payload = bytearray(6)
    payload[0] = slave_id
    payload[1] = 0x03
    payload[2] = (address >> 8) & 0xFF
    payload[3] = address & 0xFF
    payload[4] = (quantity >> 8) & 0xFF
    payload[5] = quantity & 0xFF
    crc = calculate_crc(payload)
    payload.extend([crc & 0xFF, (crc >> 8) & 0xFF])
    return bytes(payload)


def parse_read_response(response: bytes, slave_id: int) -> Optional[int]:
    if len(response) < 5:
        return None
    if response[0] != slave_id:
        return None
    function_code = response[1]
    if function_code & 0x80:
        return None
    if function_code != 0x03:
        return None
    byte_count = response[2]
    expected_len = 3 + byte_count + 2
    if len(response) < expected_len:
        return None
    received_crc = response[expected_len - 2] | (response[expected_len - 1] << 8)
    calculated_crc = calculate_crc(response[: expected_len - 2])
    if received_crc != calculated_crc:
        return None
    if byte_count < 2:
        return None
    high = response[3]
    low = response[4]
    return (high << 8) + low


class ModbusPoller:
    def __init__(
        self,
        port: str,
        baudrate: int,
        slave_id: int,
        poll_interval_ms: int,
        register_source_path: str,
        brand_key: str,
        device_id: Optional[int],
    ) -> None:
        self.port = port
        self.baudrate = baudrate
        self.slave_id = slave_id
        self.poll_interval_ms = poll_interval_ms
        self.register_source_path = register_source_path
        self.brand_key = brand_key
        self.device_id = device_id
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._serial: Optional[serial.Serial] = None
        self._registers: List[Dict] = []
        self._device_cache: Optional[int] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        if self._serial and self._serial.is_open:
            try:
                self._serial.close()
            except Exception:
                pass

    def _load_registers(self) -> None:
        with open(self.register_source_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        registers = data.get(self.brand_key)
        if not registers:
            raise ValueError(f"Brand '{self.brand_key}' not found in register map")
        self._registers = registers

    def _ensure_serial(self) -> None:
        if self._serial and self._serial.is_open:
            return
        self._serial = serial.Serial(
            port=self.port,
            baudrate=self.baudrate,
            bytesize=8,
            parity="N",
            stopbits=1,
            timeout=1,
        )

    def _resolve_device_id(self, db: Session) -> Optional[int]:
        if self._device_cache is not None:
            return self._device_cache
        if self.device_id is not None:
            device = db.query(DeviceModel).filter(DeviceModel.id == self.device_id).first()
            if device:
                self._device_cache = device.id
                return self._device_cache
        device = db.query(DeviceModel).order_by(DeviceModel.id.asc()).first()
        if device:
            self._device_cache = device.id
            return self._device_cache
        return None

    def _read_frame(self) -> Optional[bytes]:
        if not self._serial:
            return None
        header = self._serial.read(3)
        if len(header) < 3:
            return None
        byte_count = header[2]
        remainder = self._serial.read(byte_count + 2)
        return header + remainder

    def _run(self) -> None:
        try:
            self._load_registers()
        except Exception as exc:
            print(f"Modbus register load failed: {exc}")
            return

        while not self._stop_event.is_set():
            try:
                self._ensure_serial()
            except Exception as exc:
                print(f"Modbus serial open failed on {self.port}: {exc}")
                time.sleep(2)
                continue

            cycle_values: List[str] = []
            custom_payload: Dict[str, Dict[str, str]] = {}
            mapped_fields: Dict[str, str] = {}
            status_value: Optional[int] = None
            fault_code_value: Optional[int] = None

            for reg in self._registers:
                if self._stop_event.is_set():
                    break
                address = int(reg["address"])
                name = str(reg["name"])
                unit = str(reg.get("unit", ""))
                divisor = float(reg.get("divisor", 1))

                try:
                    request = build_read_request(self.slave_id, address, 1)
                    if not self._serial:
                        raise RuntimeError("Serial not available")
                    self._serial.write(request)
                    response = self._read_frame()
                    raw_value = parse_read_response(response or b"", self.slave_id)
                    if raw_value is None:
                        raise ValueError("Invalid response")
                    value = round(raw_value * divisor, 1)
                    cycle_values.append(str(value))
                    custom_payload[name] = {
                        "address": str(address),
                        "raw": str(raw_value),
                        "value": str(value),
                        "unit": unit,
                    }
                    field_key = FIELD_MAP.get(name.strip().lower())
                    if field_key:
                        if field_key == "status":
                            status_value = int(raw_value)
                        elif field_key == "fault_code":
                            fault_code_value = int(raw_value)
                        else:
                            mapped_fields[field_key] = str(value)
                except Exception:
                    cycle_values.append("ERROR")
            if cycle_values and not self._stop_event.is_set():
                db = SessionLocal()
                try:
                    device_id = self._resolve_device_id(db)
                    if device_id is None:
                        print("Modbus polling skipped: no device available")
                    else:
                        reading = VFDReadingModel(
                            device_id=device_id,
                            frequency=mapped_fields.get("frequency"),
                            speed=mapped_fields.get("speed"),
                            current=mapped_fields.get("current"),
                            voltage=mapped_fields.get("voltage"),
                            power=mapped_fields.get("power"),
                            torque=mapped_fields.get("torque"),
                            status=status_value,
                            fault_code=fault_code_value,
                            custom_data=json.dumps(custom_payload),
                        )
                        # Keep device status aligned with live Modbus telemetry.
                        device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
                        if device:
                            device.is_online = True
                            device.last_heartbeat = datetime.utcnow()
                        db.add(reading)
                        db.commit()
                except Exception as exc:
                    db.rollback()
                    print(f"Modbus polling DB error: {exc}")
                finally:
                    db.close()

            time.sleep(self.poll_interval_ms / 1000.0)
