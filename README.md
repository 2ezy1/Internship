for pushing 

navigate to your "Internship" folder then type ./push.sh "msg here" to automatically push the folder
into the Github repository hehe.

to run pgAdmin server type: 

    sudo /usr/pgadmin4/bin/setup-web.sh

to run frontend: navigate to your Internship/frontend folder 

    npm install
    npm run dev

to run backend: navigate to your Internship/backend folder

    source venv/bin/activate
    uvicorn main:app --reloa --host 0.0.0.0 port 8000