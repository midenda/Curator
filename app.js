"use strict";
const express = require ("express");
const https = require ("https");
const bodyParser = require ("body-parser");
const fs = require ("fs");
const queryString = require ("querystring");

const app = express();
app.use (express.static ("public"));
app.use (bodyParser.urlencoded ({extended: true}));

function generateState () {
    return Math.floor (Math.random() * 10000000000);
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


const playlistScopes = scopes.join (" ");

const apiData = JSON.parse (fs.readFileSync (__dirname + "/private/app_credentials.json", "utf-8", (err, data) => {
    if (err) {
        throw err;
    };
    return data;
}));

const redirect_uri = "http://localhost:3000/callback/";
const state = generateState();

const queryParams = queryString.stringify ({
    client_id: apiData.clientID,
    response_type: "code",
    redirect_uri: redirect_uri,
    state: state,
    scope: playlistScopes,
    show_dialog: false
});

app.get ("/login", (req, res) => {
    res.redirect (`https://accounts.spotify.com/authorize?${queryParams}`);
});

app.get ("/callback", (req, res) => {
    const receivedState = req.query.state;
    const authCode = req.query.code;
    const error = req.query.error || null;

    if (!error && receivedState == state) {
        res.send ("successfully redirected");

        const postBody = queryString.stringify ({
            grant_type: "authorization_code",
            code: authCode,
            redirect_uri: redirect_uri
        });

        getToken (postBody);

    } else if (receivedState !== state) {
        res.send ("BAD STATE");
        console.log (`State Received From Server: ${receivedState}\nState Sent With Request: ${state}`);
    } else {
        console.log (error);
        res.send ("Error");
    };
});

function refresh (token) {
    const postBody = queryString.stringify ({
        grant_type: "refresh_token",
        refresh_token: token
    });
    return getToken (postBody);
}


function getToken (postBody) {

    const options = {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from (`${apiData.clientID}:${apiData.clientSecret}`).toString ("base64")
        },
        method: "POST"
    };

    const request = https.request ("https://accounts.spotify.com/api/token", options, (response) => {
        response.on ("data", (data) => {
            const tokenData = JSON.parse(data.toString());
            const accessToken = tokenData.access_token;
            const refreshToken = tokenData.refresh_token;
            access (accessToken);

        });
    });
    request.write (postBody);
    request.end();

}

function access (token) {
    const options = {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Bearer " + token
        },
        method: "GET"
    };
    const request = https.request ("https://api.spotify.com/v1/me", options, (response) => {
        response.on("data", (data) => {
            const user = JSON.parse(data);
            const userID = user.id;
            getPlaylists (userID, token);

        });
        const status = response.statusCode;
        if (status !== 200) {
            console.log ("Warning! Status: " + status);
        };
    });
    request.end();
}

let playlists = [];

function getPlaylists (id, token, offset = 0) {

    const options = {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Bearer " + token
        },
        method: "GET"
    };

    const request = https.request (`https://api.spotify.com/v1/users/${id}/playlists?limit=50&offset=${offset}`, options, (response) => {
        let paged = "";
        response.on ("data", (data) => {
            paged += data;
        });

        response.on ("end", () => {
            let incomplete = JSON.parse (paged).next != null;
            const items = Object.values(JSON.parse (paged).items).map((item) => item.name);
            playlists.push(...items);

            if (incomplete) {
                offset += 50;
                getPlaylists (id, token, offset);
            } else {
                console.log(playlists);
                console.log("Complete!");
            };

        });
    });
    request.end();
}

app.listen (3000, () => {
    console.log ("Listening on port 3000");
});
