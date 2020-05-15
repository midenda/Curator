"use strict";

// Dependencies
const express = require ("express");
// const https = require ("https");
const bodyParser = require ("body-parser");
const fs = require ("fs");
const queryString = require ("querystring");
// const {spawn} = require ("child_process");

const sharp = require ("sharp");

const db = require (__dirname + "/atlas");
const spotify = require (__dirname + "/spotify-api.js");


// Express Server Setup
const app = express();

app.use (express.static ("public"));
app.use (bodyParser.urlencoded ({extended: true}));


// Random state to prevent CSRF
function generateState () {
    return Math.floor (Math.random() * 10000000000);
};

let state;
// Retrieve Client Secret and Client ID
const apiData = JSON.parse (fs.readFileSync (__dirname + "/private/secrets.json", "utf-8", (err, data) => {
    if (err) {
        throw err;
    };
    return data;
}));
const redirect_uri = apiData.redirectURI;

const scopes = [

    "app-remote-control",
    "playlist-modify-private",
    "playlist-modify-public",
    "playlist-read-collaborative",
    "playlist-read-private",
    "streaming",
    "ugc-image-upload",
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
    "user-top-read"

];

const playlistScopes = scopes.join (" ");


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

// initialLogin ();


// ------ API Interactions ------ //


// Called when a new user accesses the website
async function initialLogin (authCode) {

    const info = await spotify.requestAccess (authCode);
    const accessToken = info.access;
    const refreshToken = info.refresh;

    const userID = await spotify.retrieveUser (accessToken);

    const user = await getUser (userID);

    // db.deleteUser ({spotify_id: userID});
    if (!user) {
        await addUser (userID, refreshToken);
    }
    // db.updateUser ({spotify_id: userID}, {preferred_vibes: []});

    // const saved = await spotify.getSavedTracks (userID, accessToken);
    // console.log (`Successfully retrieved ${saved.length} tracks!`);

    // const playlists = await spotify.getPlaylists (userID, accessToken);
    // console.log (playlists);
    // console.log (`Successfully retrieved ${playlists.length} playlists!`);

    // await spotify.discover (userID, accessToken);

    // const demo = await demoPlaylist (userID, accessToken);

    // await spotify.getTopArtists (accessToken);
    // let albums = await spotify.getSavedAlbums (accessToken);

    // const a = await spotify.getAlbums (albums.map (album => album.id), accessToken);

    // await spotify.saveAlbumsOfTracks (saved.map (album => album.id), accessToken);
    // await spotify.purgeSinglesFromAlbumLibrary (accessToken);

    // await spotify.search ({keywords: "Window", types: ["track", "album"]}, accessToken);

    // const tracks = await spotify.getPlaylist (playlists.find (playlist => playlist.name === "Funk").id, accessToken);
    // console.log (tracks);
    // console.log (`Successfully retrieved ${tracks.length} tracks!`);

    // await spotify.getTracks (tracks.map (track => track.id), accessToken);

    // await spotify.saveTracks (tracks.map (track => track.id), accessToken);

    // await spotify.followArtistsOfTracks (saved.map (track => track.id), accessToken);
    // await spotify.saveAlbumsOfTracks (saved.map (track => track.id), accessToken);
    // await spotify.everything (userID, accessToken);
    // await spotify.followArtistsOfPlaylist (playlists.find (playlist => playlist.name === "EVERYTHING").id, accessToken);

    // const following = await spotify.getFollowedArtists (accessToken);
    // console.log (following[50]);

    // const found = await spotify.locate ("75ZoDBdTAO9e896PtMsbnG", userID, accessToken);
    // console.log (found);

    // await spotify.updateDetails (demo, accessToken, {name: ":o"});
    // await spotify.replaceItems (demo, accessToken, tracks.map (track => track.id));

    // await spotify.isFollowingPlaylist (playlists [10].id, accessToken, userID);

    // const seed = {
    //     // tracks: "75ZoDBdTAO9e896PtMsbnG",
    //     artists: "0oBsnAC3fzYkTHF3bkfNx6",
    //     genres: "jazz"
    // };

    // const related = await spotify.getRelatedArtists ("0oBsnAC3fzYkTHF3bkfNx6", accessToken);
    // console.log (related);

    // const recommendations = await spotify.getRecommendations (seed, accessToken);
    // console.log (recommendations);

    // await spotify.getPlayback (accessToken);
    // console.log (await spotify.getPlaylist ("7mUGKVfwTtIQPnmOgASadv", accessToken));
    // await spotify.setPlayback (accessToken, {context: "spotify:playlist:35VgIxwk3BjnooaEogMGol", ids: ["75ZoDBdTAO9e896PtMsbnG", "4vHNeBWDQpVCmGbaccrRzi", "6fBbjet8vNl41n66lUUVsm"]});
    // await spotify.addToQueue (["75ZoDBdTAO9e896PtMsbnG", "4vHNeBWDQpVCmGbaccrRzi", "6fBbjet8vNl41n66lUUVsm"], accessToken);

    // const analysis = await spotify.getAnalysis ("75ZoDBdTAO9e896PtMsbnG", accessToken);
    // const features = await spotify.getFeatures ("75ZoDBdTAO9e896PtMsbnG", accessToken);
    // console.log (features);
}


async function compressImage (image) {

    image = await sharp (image)

    const imageData = await image.metadata();
    let quality;

    if (imageData.size > 250000) {
        quality = 85;
    } else {
        quality = 100;
    };

    const processed = await image.resize ({width: 1080}).jpeg ({
        quality: quality,
    }).toBuffer ({resolveWithObject: true});

    return processed.data.toString("base64");
}


async function demoPlaylist (userID, token) {

    const playlists = await spotify.getPlaylists (userID, token);

    if (!playlists.map (track => track.name).includes ("1010010001010101")) {

        const image = fs.readFileSync (__dirname + "/public/images/default-playlist-image.jpeg", (err, data) => {
            if (err) {
                throw err;
            };
            return data;
        });

        const details = {
            name: "1010010001010101",
            description: "This playlist was automatically generated from pure vibes",
            image: await compressImage (image),
            tracks: ["3hARuUtzTdUuWH1KiLJlSf", "4W5TgSWXxpaDzqJcyeQd61", "0LBtTqsatK31j5bhBCFwkb", "2PKTJ0qAGaavKrhLJuQrRt", "55d7W9ClLsLUf74IQ7Qp0z"]
        };

        const playlist = await spotify.createPlaylist (userID, token, details);

        setTimeout (() => { spotify.unfollowPlaylist (playlist.id, token) }, 15000);

        return playlist.id;
    };
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
