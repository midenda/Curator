const express = require ("express");
const https = require ("https");
const bodyParser = require ("body-parser");
const fs = require ("fs");

app = express();
app.use (express.static("public"));
app.use (bodyParser.urlencoded ({extended: true}));

function generateState () {
    return Math.floor(Math.random() * 10000000000);
};

const scopes = [
    "playlist-modify-private",
    "playlist-modify-public",
    "playlist-read-collaborative",
    "playlist-read-private",
    "user-follow-modify",
    "user-follow-read",
    "user-library-modify",
    "user-library-read",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-email",
    "user-read-playback-position",
    "user-read-playback-state",
    "user-read-private",
    "user-read-recently-played",
    "user-top-read",
];

const apiData = JSON.parse(fs.readFileSync(__dirname + "/private/app_credentials.json", "utf-8", (err, data) => {
    if (err) {
        throw err;
    };
    return data;
}));

const redirect_uri = "localhost:3000/callback"

app.get ("/callback", (req, res) => {
    res.send("successfully redirected");
    console.log("request: \n" + req);
});

app.get ("/login", (req, res) => {
    res.send("Redirecting...");
    https.get (`https://accounts.spotify.com/authorize?client_id=${apiData.clientID}&response_type=code&redirect_uri=${redirect_uri}&state=${generateState()}&scope=${scopes[10]}`, (response) => {
        console.log(response.statusCode);
        console.log(response);

        response.on("data", (data) => {
            console.log(data.toString());
        });
    });
});

app.listen(3000, () => {
    console.log("Listening on port 3000");
});
