"use strict";

// Dependencies
const express = require ("express");
const https = require ("https");
const bodyParser = require ("body-parser");
const fs = require ("fs");
const queryString = require ("querystring");
const {spawn} = require ("child_process");
const request = require (__dirname + "/request");

const db = require (__dirname + "/atlas");


// Express Server Setup
const app = express();

app.use (express.static ("public"));
app.use (bodyParser.urlencoded ({extended: true}));


// Random state to prevent CSRF
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
const apiData = JSON.parse (fs.readFileSync (__dirname + "/private/secrets.json", "utf-8", (err, data) => {
    if (err) {
        throw err;
    };
    return data;
}));


let state;
const redirect_uri = apiData.redirectURI;
const authToken = Buffer.from (`${apiData.clientID}:${apiData.clientSecret}`).toString ("base64");



// ------ Express Routing ------ //

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
        initialLogin (authCode);

    } else if (receivedState !== state) {

        res.send ("BAD STATE");
        console.log (`State Received From Server: ${receivedState}\nState Sent With Request: ${state}`);

    } else {

        console.log (error);
        res.send ("Error");

    };

});




// ------ API Interactions ------ //


// Called when a new user accesses the website
async function initialLogin (authCode) {

    const info = await requestAccess (authCode);
    const accessToken = info.access;
    const refreshToken = info.refresh;

    const userID = await retrieveUser (accessToken);

    const user = await getUser (userID);

    // db.deleteUser ({spotify_id: userID});
    if (!user) {
        await addUser (userID, refreshToken);
    }
    // db.updateUser ({spotify_id: userID}, {preferred_vibes: ["Vibe Music", "Jazz", "Funk"]});

    // const saved = await getSaved (userID, accessToken);
    // console.log (saved);

    const playlists = await getPlaylists (userID, accessToken);
    // console.log (`Successfully retrieved ${playlists.length} playlists!`);

    if (!playlists.map (track => track.name).includes ("1010010001010101")) {
        await createPlaylist (userID, accessToken, "1010010001010101", "This playlist was automatically generated from VIBES");
    }

    const tracks = await getPlaylist (playlists[14].id, accessToken);
    // console.log (`Successfully retrieved ${tracks.length} tracks!`);

    const analysis = await getAnalysis (tracks[10].id, accessToken);
    const features = await getFeatures (tracks[10].id, accessToken);
}


// Uses a refresh token to acquire a new access token
async function refreshAccess (token) {

    const postBody = queryString.stringify ({
        grant_type: "refresh_token",
        refresh_token: token
    });

    return await requestAccess (postBody);
}


// Acquires an access token and a refresh token
async function requestAccess (authCode) {

    const url = "https://accounts.spotify.com/api/token";

    const postBody = queryString.stringify ({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirect_uri
    });

    const rq = await request (url, authToken, "POST", postBody, "Basic");

    const tokens = {
        access: rq.access_token,
        refresh: rq.refresh_token
    };

    return tokens;
}


// Fetches the user's details
async function retrieveUser (token) {

    const url = "https://api.spotify.com/v1/me";

    const rq = await request (url, token);
    console.log ("Retrieved user successfully");

    return rq.id;
}


// Fetches a user's playlists
async function getPlaylists (userID, token) {

    let url = `https://api.spotify.com/v1/users/${userID}/playlists?limit=50&offset=0`;


    async function retrievePlaylists (url) {

        const rq = await request (url, token);

        const playlists = rq.items.map (playlist => ({
            name: playlist.name,
            id: playlist.id
        }));

        const next = rq.next;

        if (next != null) {
            playlists.push (... await retrievePlaylists (next));
        }

        return playlists;
    }

    return await retrievePlaylists (url);

}


// Fetches a user's saved songs
async function getSaved (userID, token) {

    const url = "https://api.spotify.com/v1/me/tracks?limit=50&offset=0";


    async function retrieveSaved (url) {

        const rq = await request (url, token);

        const tracks = rq.items.map (track => ({name: track.track.name, id: track.track.id}));
        const next = rq.next;

        if (next != null) {
            tracks.push (... await retrieveSaved (next));
        }

        return tracks;

    }

    return await retrieveSaved (url);
}


// Fetches the details of a single playlist
async function getPlaylist (playlistID, token) {

    const fields = "tracks.items(track(name,id)),tracks.next";

    let url = `https://api.spotify.com/v1/playlists/${playlistID}?fields=${fields}`;


    async function retrievePlaylist (url) {
        const rq = await request (url, token);

        const data = rq.tracks || rq;

        const tracks = data.items.map (track => ({name: track.track.name, id: track.track.id}));
        const next = data.next;

        if (next != null) {
            tracks.push (... await retrievePlaylist (next));
        }

        return tracks;
    }

    return await retrievePlaylist (url);
}


// Search Spotify for tracks, albums etc
async function search (query, token) {

    const queryParams = queryString.stringify ({
        q: query,
        type: ["album", "artist", "playlist", "track", "show", "episode"].join (","),
        limit: 50,
        offset: 0
    });

    let url = `https://api.spotify.com/v1/search?${queryParams}`;

    const rq = await request (url, token);
    console.log (rq);

}


// Spotify vibe check
async function getAnalysis (id, token) {
    const url = `https://api.spotify.com/v1/audio-analysis/${id}`;

    const rq = await request (url, token);

    // console.log (rq.meta);
    // console.log (rq.track);
    // console.log (rq.bars);
    // console.log (rq.beats);
    // console.log (rq.sections);
    // console.log (rq.segments);
    // console.log (rq.tatums);

    return rq;
}

async function getFeatures (ids, token) {

    if (!Array.isArray (ids)) {
        ids = [ids];
    }

    const url = `https://api.spotify.com/v1/audio-features?ids=${ids.join (",")}`;

    const rq = await request (url, token);
    return rq;
}


async function createPlaylist (userID, token, name, description) {

    const url = `https://api.spotify.com/v1/users/${userID}/playlists`;

    const data = {
        name: name,
        public: false,
        collaborative: false,
        description: description
    };

    const rq = await request (url, token, "POST", data, type = "json");
}


async function addTrack () {

}


// Duplicates the user's saved songs library
async function everything (userID, token) {
    const library = await getSaved (userID, token);
    const playlists = await getPlaylists (userID, token);
    if (playlists.map (track => track.name).includes ("EVERYTHING")) {
        console.log ("Found an 'Everything' playlist");
    } else {
        console.log ("Didn't find everything, creating playlist");
        await createPlaylist ("EVERYTHING");
    }


}


async function saveDiscovery (user, token) {

}


function curateQueue (user, token) {

}



// ------ Database interactions ------ //

async function getUser (id) {
    return await db.getUser ({spotify_id: id});
}


async function saveUser (id, token) {

    if (! await getUser (id)) {
        return await addUser (id, token);
    } else {
        return true;
    };
}


async function addUser (id, refreshToken) {
    return await db.addUser ({spotify_id: id, refresh_token: refreshToken});
}

async function deleteUser () {
    return await db.deleteUser ();
}


// ------ Algorithm interactions ------ //


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
