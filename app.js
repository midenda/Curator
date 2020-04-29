"use strict";

// Dependencies
const express = require ("express");
const https = require ("https");
const bodyParser = require ("body-parser");
const fs = require ("fs");
const queryString = require ("querystring");
const {spawn} = require ("child_process");
const axios = require ("axios");

// Express Server Setup
const app = express();

app.use (express.static ("public"));
app.use (bodyParser.urlencoded ({extended: true}));


// Cross-Site Request Forgery (CSRF)
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


// Retrieve Client Secret and Client ID
const apiData = JSON.parse (fs.readFileSync (__dirname + "/private/app_credentials.json", "utf-8", (err, data) => {
    if (err) {
        throw err;
    };
    return data;
}));


let state;
const redirect_uri = "http://localhost:3000/callback/";



// Express Routing


app.get ("/", (req, res) => {
    res.sendFile (__dirname + "/index.html");
});


app.get ("/login", (req, res) => {

    state = generateState();

    const queryParams = queryString.stringify ({

        client_id: apiData.clientID,
        response_type: "code",
        redirect_uri: redirect_uri,
        state: state,
        scope: playlistScopes,
        show_dialog: false

    });

    res.redirect (`https://accounts.spotify.com/authorize?${queryParams}`);
});


app.get ("/callback", (req, res) => {

    const receivedState = req.query.state;
    const authCode = req.query.code;
    const error = req.query.error || null;

    if (!error && receivedState == state) {

        res.redirect ("/?logged_in=true");
        initialLogin(authCode);

    } else if (receivedState !== state) {

        res.send ("BAD STATE");
        console.log (`State Received From Server: ${receivedState}\nState Sent With Request: ${state}`);

    } else {

        console.log (error);
        res.send ("Error");

    };

});



// API Interactions


// Called when a new user accesses the website
async function initialLogin (authCode) {

    const postBody = queryString.stringify ({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirect_uri
    });

    const info = await requestAccess (postBody);
    const accessToken = info.access;

    const userID = await retrieveUser (accessToken);

    const playlists = await getPlaylists (userID, accessToken);
    console.log (`Successfully retrieved ${playlists.length} playlists!`);

    const tracks = await getPlaylist (playlists[12].id, accessToken);
    console.log (`Successfully retrieved ${tracks.length} tracks!`);
}


// Uses a refresh token to acquire a new access token
function refreshAccess (token) {

    const postBody = queryString.stringify ({
        grant_type: "refresh_token",
        refresh_token: token
    });

    return requestAccess (postBody);
}


// Acquires an access token and a refresh token
async function requestAccess (postBody) {

    const url = "https://accounts.spotify.com/api/token";

    const options = {

        method: "POST",
        url: url,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from (`${apiData.clientID}:${apiData.clientSecret}`).toString ("base64")
        },
        data: postBody

    };

    try {

        const request = await axios (options);

        const tokens = {
            access: request.data.access_token,
            refresh: request.data.refresh_token
        }

        const status = request.status;

        if (status == 200) {
            console.log ("Successfully acquired access token!");
        } else {
            console.log ("Status: " + status);
            throw status;
        }

        return tokens;

    } catch (error) {
        console.error (error);
        throw error;
    }

}


// Fetches the user's details
async function retrieveUser (token) {

    const url = "https://api.spotify.com/v1/me";

    const options = {

        method: "GET",
        url: url,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Bearer " + token
        }

    };


    try {

        const request = await axios (options);
        const status = request.status;

        if (status == 200) {
            console.log ("Successfully retrieved user id!");
        } else {
            console.log ("Status: " + status);
            throw status;
        }

        return request.data.id;

    } catch (error) {
        console.error (error);
        throw error;
    }

}


// Fetches a user's playlists
async function getPlaylists (userID, token) {

    let url = `https://api.spotify.com/v1/users/${userID}/playlists?limit=50&offset=0`


    async function retrievePlaylists (url) {

        const options = {

            method: "GET",
            url: url,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "Bearer " + token
            }

        };

        try {

            const request = await axios (options);
            const status = request.status;

            if (status == 200) {

                const data = request.data;

                const playlists = data.items.map (playlist => ({
                    name: playlist.name,
                    id: playlist.id
                }));

                const next = data.next;

                if (next != null) {
                    playlists.push (... await retrievePlaylists (next));
                }

                return playlists;

            } else {
                console.log ("Status: " + status);
                throw status;
            }

        } catch (error) {
            console.error (error);
            throw error;
        }

    }

    return await retrievePlaylists (url);
}


// Fetches the details of a single playlist
async function getPlaylist (playlistID, token) {

    const fields = "tracks.items(track(name,id)),tracks.next";

    let url = `https://api.spotify.com/v1/playlists/${playlistID}?fields=${fields}`;


    async function retrievePlaylist (url) {

        const options = {

            method: "GET",
            url: url,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "Bearer " + token
            }

        };


        try {

            const request = await axios (options);
            const status = request.status;

            if (status == 200) {

                const data = request.data.tracks || request.data;
                // console.log (data);
                const tracks = data.items.map (track => ({name: track.track.name, id: track.track.id}));
                const next = data.next;

                if (next != null) {
                    tracks.push (... await retrievePlaylist (next));
                }

                return tracks;

            } else {
                console.log ("Status: " + status);
                throw status;
            }

        } catch (error) {
            console.error (error);
            throw error;
        }

    }

    return await retrievePlaylist (url);
}


function everything (user) {

}


function saveDiscovery (user) {

}


function curateQueue (user) {

}



// Database interactions


function getUser (id) {
    // runSpawn ("")
}


function saveUser (id, token) {
    if (!getUser(id)) {
        // runSpawn ("")
    };
    return true;
}


function addUser (user, refreshToken) {

}



// Algorithm interactions


function curate (playlist) {

}


function shuffleQueue (user) {

}


function getVibe (song) {

}


function curateQueue (user) {

}


// Runs a shell command
function runSpawn (command, flags) {
    const executable = spawn (command, flags);

    executable.stdout.on ("data", data => {
        console.log (`StdOut: ${data}`);
    });

    executable.stderr.on ("data", data => {
        console.log (`StdErr: ${data}`);
    });

    executable.on ("error", (error) => {
        console.log (`Error: ${error.message}`);
    });

    executable.on ("close", code => {
        console.log (`Child Process (${command} ${flags}) exited with code ${code}`);
    });
}



const server = app.listen (process.env.port || 3000, () => {
    console.log ("Listening on port " + server.address().port);
});
