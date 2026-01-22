import axios from "axios";

function getCalendlyUser() {    
axios.get("https://api.calendly.com/users/me", {
  headers: {
    Authorization: `eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzYzMzg5NzU5LCJqdGkiOiI2ZmM1ZmY4Ni1jOTAwLTQ2YTMtODViMy00N2UxYWRkNjRkNTciLCJ1c2VyX3V1aWQiOiIyYjdiYzdmNS1lODUzLTRjNmMtYjdlNy0yMGU2NTFiNWY3YTIifQ.Or6mcaCRdHmj4rwvpyZjzdZtpaO_6VQXpIbiKoDyUsX7nmsyGUPbg3E19vGA00m9LzvB51xAFXPi4Lz_JZ2w7A`
  }
})
.then(res => console.log(res.data))
.catch(err => console.log(err.response.data));
}

getCalendlyUser();
