"use strict";

const fs = require ("fs");
const queryString = require ("querystring");
const request = require (__dirname + "/request");

const redirect_uri = "http://localhost:3000/callback/";
const authToken = Buffer.from (`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString ("base64");


async function iterative (params, filter) {

    const rq = await request (params.url, params.token, params.config);
    const list = filter (rq);

    params.url = rq.next;
    if (params.limit) {
        params.limit -= 1;
    }

    if (rq.next != null && params.limit && params.limit > 0) {
        list.push (... await iterative (params, filter = filter));
    } else if (rq.next != null) {
        list.push (... await iterative (params, filter = filter));
    }

    return list;
}

function* paginate (list, maxlength) {
    let i = 0;

    while (i < list.length) {
        yield list.slice (i, i + maxlength);
        i += maxlength;
    };
}



// --------------------------------------------------- API Interactions --------------------------------------------------- //



// Acquires an access token and a refresh token
async function requestAccess (token, type = "authorization_code") {

    const url = "https://accounts.spotify.com/api/token";

    const config = {
        method: "POST",
        data: queryString.stringify ({
            grant_type: type,
            ... (type === "authorization_code") ? {code: token} : {refresh_token: token},
            redirect_uri: redirect_uri
        }),
        auth: "Basic"
    };

    const rq = await request (url, authToken, config);

    const tokens = {
        access: rq.access_token,
        refresh: rq.refresh_token
    };

    return tokens;
}

// Uses a refresh token to acquire a new access token
async function refreshAccess (token) {

    const tokens = await requestAccess (token, "refresh_token");
    return tokens.access;
}


// -------------------->   User   < -------------------- //

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

    return await iterative ({url, token}, req => {

        return req.items.map (playlist => ({
            name: playlist.name,
            id: playlist.id
        }));

    });
}

// Fetches a user's saved songs
async function getSavedTracks (userID, token) {

    const url = "https://api.spotify.com/v1/me/tracks?limit=50&offset=0";


    return await iterative ({url, token}, req => {

        return req.items.map (track => ({
            name: track.track.name,
            id: track.track.id,
            album: {
                name: track.track.album.name,
                id: track.track.album.id,
                artists: track.track.album.artists,
                images: track.track.album.images,
                length: track.track.album.total_tracks
            },
            artists: track.track.artists.map (artist => ({name: artist.name, id: artist.id})),
            preview_url: track.track.preview_url
        }));

    });
}

// Returns all albums in a user's library
async function getSavedAlbums (token) {
    const url = "https://api.spotify.com/v1/me/albums";

    return await iterative ({url, token}, req => {
        return req.items.map (item => ({
            name: item.album.name,
            id: item.album.id,
            artists: item.album.artists.map (artist => ({
                name: artist.name,
                id: artist.id
            })),
            images: item.album.images,
            genres: item.album.genres,
            tracks: item.album.tracks.items.map (track => ({
                name: track.name,
                id: track.id,
                artists: track.artists.map (artist => ({
                    name: artist.name,
                    id: artist.id
                })),
                preview_url: track.preview_url
            })),
            length: item.album.total_tracks
        }));
    });
}

// Returns all artists that a user follows
async function getFollowedArtists (token) {

    const url = `https://api.spotify.com/v1/me/following?type=artist&limit=50`;

    async function retrieveFollowing (url) {

        const rq = await request (url, token);

        const artists = rq.artists.items.map (artist => ({
            name: artist.name,
            id: artist.id,
            genres: artist.genres
        }));

        const next = rq.artists.next;

        if (next != null) {
            artists.push (... await retrieveFollowing (next));
        }

        return artists;
    }

    return await retrieveFollowing (url);
}

//
async function getTopTracks (token) {

    const query = queryString.stringify ({
        limit: 50, // max 50
        offset: 0,
        time_range: "short_term" // long_term: all available data, medium_term: ~6 months, short_term: ~4 weeks
    });

    const url = `https://api.spotify.com/v1/me/top/tracks?${query}`;

    return await iterative ({url, token}, req => req.items.map (track => ({
        name: track.name,
        id: track.id,
        album: {
            name: track.album.name,
            id: track.album.id,
            artists: track.album.artists,
            images: track.album.images,
            length: track.album.total_tracks
        },
        artists: track.artists.map (artist => ({name: artist.name, id: artist.id})),
        preview_url: track.preview_url
    })));
}

//
async function getTopArtists (token) {

    const query = queryString.stringify ({
        limit: 50, // max 50
        offset: 0,
        time_range: "short_term" // long_term: all available data, medium_term: ~6 months, short_term: ~4 weeks
    });

    const url = `https://api.spotify.com/v1/me/top/artists?${query}`;

    return await iterative ({url, token}, req => req.items.map (artist => ({
        name: artist.name,
        id: artist.id,
        genres: artist.genres,
        followers: artist.followers.total,
        images: artist.images
    })));
}


// -------------------->   "GET" Requests   < -------------------- //

// Fetches the details of a single playlist
async function getPlaylist (playlistID, token) {

    const fields = "tracks.items(track(album,artists,name,id,preview_url)),tracks.next";

    let url = `https://api.spotify.com/v1/playlists/${playlistID}?fields=${fields}`;


    async function retrievePlaylist (url) {

        const rq = await request (url, token);

        const data = rq.tracks || rq;

        const tracks = data.items.map (track => ({
            name: track.track.name,
            id: track.track.id,
            album: {
                name: track.track.album.name,
                id: track.track.album.id,
                artists: track.track.album.artists,
                images: track.track.album.images,
                length: track.track.album.total_tracks
            },
            artists: track.track.artists.map (artist => ({name: artist.name, id: artist.id})),
            preview_url: track.track.preview_url
        }));

        // const tracks = data.items.map (track => ({name: track.track.name, id: track.track.id}));
        const next = data.next;

        if (next != null) {
            tracks.push (... await retrievePlaylist (next));
        }

        return tracks;
    }

    return await retrievePlaylist (url);
}

// Returns a track object from each trackID given
async function getTracks (trackIDs, token) {

    const pages = paginate (trackIDs, 50);

    const tracks = [];

    for (const page of pages) {

        const query = queryString.stringify ({
            market: "from_token",
            ids: page.join (",")
        });

        const url = `https://api.spotify.com/v1/tracks?${query}`;

        const rq = await request (url, token);

        const items = rq.tracks.map (track => ({
            name: track.name,
            id: track.id,
            album: {
                name: track.album.name,
                id: track.album.id,
                artists: track.album.artists,
                images: track.album.images,
                length: track.album.total_tracks
            },
            artists: track.artists.map (artist => ({name: artist.name, id: artist.id})),
            preview_url: track.preview_url
        }));

        tracks.push (... items);
    }

    return tracks;
}

// Returns an album object from each albumID given
async function getAlbums (albumIDs, token) {

    const pages = paginate (albumIDs, 20);

    const albums = [];

    for (const page of pages) {

        const query = queryString.stringify ({
            market: "from_token",
            ids: page.join (",")
        });

        const url = `https://api.spotify.com/v1/albums?${query}`;

        const rq = await request (url, token);

        const items = rq.albums.map (item => ({
            name: item.name,
            id: item.id,
            artists: item.artists.map (artist => ({
                name: artist.name,
                id: artist.id
            })),
            images: item.images,
            genres: item.genres,
            tracks: item.tracks.items.map (track => ({
                name: track.name,
                id: track.id,
                artists: track.artists.map (artist => ({
                    name: artist.name,
                    id: artist.id
                })),
                preview_url: track.preview_url
            })),
            length: item.total_tracks
        }));

        albums.push (... items);
    };

    return albums;
}

// Returns the contents of the "Discover Weekly" playlist, if it is in the user's library
async function getWeekly (userID, token) {
    const playlists = await getPlaylists (userID, token);

    const discovery = playlists.find (playlist => playlist.name === "Discover Weekly");

    if (discovery) {
        const playlist = await getPlaylist (discovery.id, token);

        return playlist.map (track => track.id);

    } else {
        return false;
    }
}

// Gets the Spotify vibe check of each track given
async function getAnalysis (trackID, token) {
    const url = `https://api.spotify.com/v1/audio-analysis/${trackID}`;

    const rq = await request (url, token);

    const trackData = {
        duration: rq.track.duration,
        fade: {
            in: rq.track.end_of_fade_in,
            out: rq.track.start_of_fade_out
        },
        loudness: rq.track.loudness,
        tempo: {
            tempo: rq.track.tempo,
            confidence: rq.track.tempo_confidence
        },
        signature: {
            signature: rq.track.time_signature,
            confidence: rq.track.time_signature_confidence
        },
        key: {
            key: rq.track.key,
            confidence: rq.track.key_confidence
        },
        mode: {
            mode: rq.track.mode,
            confidence: rq.track.mode_confidence
        }
    };

    // console.log (rq.meta);
    console.log (trackData);
    // console.log (rq.bars);
    // console.log (rq.beats);
    // console.log (rq.sections);
    // console.log (rq.segments);
    // console.log (rq.tatums);

    return rq;
}

// Gets the spotify track feature summary of each track given
async function getFeatures (trackIDs, token) {

    if (!Array.isArray (trackIDs)) {
        trackIDs = [trackIDs];
    }

    const url = `https://api.spotify.com/v1/audio-features?trackIDs=${trackIDs.join (",")}`;

    const rq = await request (url, token);
    return rq;
}

//
async function getRecommendations (seed, token, filters) {

    const query = queryString.stringify ({
        ... seed.tracks && {seed_tracks: seed.tracks},
        ... seed.artists && {seed_artists: seed.artists},
        ... seed.genres && {seed_genres: seed.genres},
        limit: 50, // max 100
        market: "from_token",
        ... {filters}
    });

    const url = `https://api.spotify.com/v1/recommendations?${query}`;

    // const tunables = { // min_*, max_*, target_*
    //     acousticness: 0.1, // Acoustic: 1, Non-acoustic: 0
    //     danceability: 0.6, // Danceable: 1, Undanceable: 0
    //     duration_ms: 1341,
    //     energy: 0.9, // High energy: 1, Low energy: 0
    //     instrumentalness: 0.1, // Instrumental: 1, Vocals: 0
    //     key: 3, // C: 0, C#/Db: 1, D: 2, ..., B: 11
    //     liveness: 0.1, // Live: 1, No audience: 0
    //     loudness: -6.93, // db
    //     mode: 0, // Major: 1, Minor: 0
    //     popularity: 1,
    //     speechiness: 0.2, // Vocal only: 1, Non-speech: 0
    //     tempo: 140.5,
    //     time_signature: 4,
    //     valence: 0.9 // Happy, cheerful: 1; Sad, angry: 0
    // };

    const rq = await request (url, token);

    return rq.tracks.map (track => ({
        name: track.name,
        id: track.id,
        album: {
            name: track.album.name,
            id: track.album.id,
            artists: track.album.artists,
            images: track.album.images,
            length: track.album.total_tracks
        },
        artists: track.artists.map (artist => ({name: artist.name, id: artist.id})),
        preview_url: track.preview_url
    }));
}

//
async function getRelatedArtists (artistID, token) {
    const url = `https://api.spotify.com/v1/artists/${artistID}/related-artists`;

    const rq = await request (url, token);

    return rq.artists.map (artist => ({
        name: artist.name,
        id: artist.id,
        genres: artist.genres,
        images: artist.images
    }));
}


// -------------------->   "Create / Add" Requests   < -------------------- //

// Creates a new playlist
async function createPlaylist (userID, token, details) {

    const url = `https://api.spotify.com/v1/users/${userID}/playlists`;

    const config = {
        method: "POST",
        data: {
            name: (details) ? details.name : "New Playlist",
            public: false,
            collaborative: false,
            description: (details) ? details.description : "This playlist was automatically generated from pure vibes"
        },
        type: "json"
    };

    const playlist = await request (url, token, config);

    if (details.image) {
        addPlaylistImage (playlist.id, token, details.image);
    };

    if (details.tracks && details.tracks.length > 0) {
        addTracks (playlist.id, token, details.tracks);
    };

    return playlist;
}

// Adds an image to a playlist
async function addPlaylistImage (playlistID, token, image) {

    const url = `https://api.spotify.com/v1/playlists/${playlistID}/images`;

    const config = {
        method: "PUT",
        data: image,
        type: "jpeg"
    };

    const rq = await request (url, token, config);
    return true;
}

// Adds tracks to an existing playlist
async function addTracks (playlistID, token, tracks) {
    const url = `https://api.spotify.com/v1/playlists/${playlistID}/tracks`;

    let uris;

    if (tracks && Array.isArray (tracks)) {

        uris = tracks.map (track => "spotify:track:" + track);

    } else if (tracks && typeof tracks === "string") {

        uris = [tracks];

    }

    const config = {
        method: "POST",
        data: JSON.stringify ({uris: uris}),
        type: "json"
    };

    const playlist = await request (url, token, config);

    return playlist.snapshot_id;
}


// -------------------->   "Delete / Remove" Requests   < -------------------- //

// Removes tracks from a playlist
async function removeTracks (playlistID, token, tracks) {
    const url = `https://api.spotify.com/v1/playlists/${playlistID}/tracks`;

    let uris;

    if (tracks && Array.isArray (tracks)) {

        uris = tracks.map (track => {uri: "spotify:track:" + track});

    } else if (tracks && typeof tracks === "string") {

        uris = [{uri: "spotify:track:" + tracks}];

    }

    const config = {
        method: "DELETE",
        data: JSON.stringify ({tracks: uris}),
        type: "json"
    };

    const rq = await request (url, token, config);
}

// Removes duplicate tracks from a playlist
async function removeDuplicateTracks (playlistID, token) {
}


// -------------------->   "Follow / Save" Requests   < -------------------- //

// Checks if users are following a playlist
async function isFollowingPlaylist (playlistID, token, userIDs) {

    if (typeof userIDs === "object") {
        userIDs = userIDs.join (",");
    };

    const url = `https://api.spotify.com/v1/playlists/${playlistID}/followers/contains?ids=${userIDs}`;

    const rq = await request (url, token);
    console.log (rq);
}

// Follow a playlist
async function followPlaylist (playlistID, token) {
    const url = `https://api.spotify.com/v1/playlists/${playlistID}/followers`;

    const config = {
        data: {
            public: true
        },
        type: "json"
    };

    const rq = await request (url, token, config);
    return rq;
}

// Follows every artist given
async function followArtists (artistIDs, token) {
    const url = "https://api.spotify.com/v1/me/following?type=artist";
    console.log (`Following ${artistIDs.length} artists`);
    const pages = paginate (artistIDs, 50);

    for (const page of pages) {

        const config = {
            method: "PUT",
            data: {
                ids: page
            },
            type: "json"
        };

        const rq = await request (url, token, config);
    }

    return true;
}

// Saves every album given to the user's library
async function saveAlbums (albumIDs, token) {

    const url = "https://api.spotify.com/v1/me/albums";

    console.log (`Saving ${albumIDs.length} albums`);

    const pages = paginate (albumIDs, 50);

    for (let page of pages) {

        const albums = await getAlbums (page, token);

        page = page.filter (album => {
            if (! album.length < 3) {
                return album;
            };
        });

        const config = {
            method: "PUT",
            data: page,
            type: "json"
        };

        const rq = await request (url, token, config);
    }
    console.log ("Albums saved!");
    return true;
}

// Saves every track given to the user's library
async function saveTracks (trackIDs, token) {
    const url = "https://api.spotify.com/v1/me/tracks";

    const pages = paginate (trackIDs, 50);

    for (const page of pages) {

        const config = {
            method: "PUT",
            type: "json",
            data: page
        };

        const rq = await request (url, token, config);
    }
    return true;
}

// Follows every artist of every track given
async function followArtistsOfTracks (trackIDs, token) {

    const tracks = await getTracks (trackIDs, token);

    let artists = tracks.map (track => track.artists).flat();

    artists = [... new Set (artists)].map (artist => artist.id);

    await followArtists (artists, token);
    return true;
}

// Follows every artist of every track in a playlist
async function followArtistsOfPlaylist (playlistID, token) {
    const tracks = await getPlaylist (playlistID, token);
    await followArtistsOfTracks (tracks.map (track => track.id));
    return true;
}

// Saves the album of every track given to a user's library
async function saveAlbumsOfTracks (trackIDs, token) {
    const tracks = await getTracks (trackIDs, token);

    let albums = tracks.map (track => ({
        id: track.album.id,
        length: track.album.length
    }));

    albums = [... new Set (albums)];

    albums = albums.filter (album => {
        if (! album.length < 3) {
            return album;
        };
    });

    await saveAlbums (albums.map (album => album.id), token);
    return true;
}


// -------------------->   "Unfollow / Unsave" Requests   < -------------------- //

// Unfollow a playlist
async function unfollowPlaylist (playlistID, token) {

    const url = `https://api.spotify.com/v1/playlists/${playlistID}/followers`;

    const config = {
        method: "DELETE"
    };

    const rq = await request (url, token, config);
    console.log ("Playlist unfollowed");

    return rq;
}

// Unfollow an artist
async function unfollowArtist (artistID, token) {

}

// Removes every track given from the user's library
async function unsaveTracks (trackIDs, token) {
    const url = "https://api.spotify.com/v1/me/tracks";

    const pages = paginate (trackIDs, 50);

    for (const page of pages) {

        const config = {
            method: "DELETE",
            type: "json",
            data: page
        };

        const rq = await request (url, token, config);
    }
    return true;
}

// Removes every track given from the user's library
async function unsaveAlbums (albumIDs, token) {
    const url = "https://api.spotify.com/v1/me/albums";

    const pages = paginate (albumIDs, 50);

    for (const page of pages) {

        const config = {
            method: "DELETE",
            type: "json",
            data: page
        };

        const rq = await request (url, token, config);
    }
    return true;
}


// -------------------->   Miscellaneous Requests   < -------------------- //

// Replace a playlist's items
async function replaceItems (playlistID, token, trackIDs) {
    const url = `https://api.spotify.com/v1/playlists/${playlistID}/tracks`;

    let surplus;
    if (! trackIDs.length <= 100) {
        surplus = trackIDs.slice (100);
        trackIDs = trackIDs.slice (0, 101);
    }

    const uris = trackIDs.map (id => "spotify:track:" + id);

    const config = {
        method: "PUT",
        type: "json",
        data: JSON.stringify({ uris: uris })
    };

    const rq = await request (url, token, config);

    if (surplus && surplus.length > 0) {
        await addTracks (playlistID, token, surplus);
    }

    console.log ("Playlist items replaced");
    return true;
}

// Reorder a playlist's items
async function reorderItems (playlistID, token, details) {
    const url = `https://api.spotify.com/v1/playlists/${playlistID}/tracks`;

    const config = {
        method: "PUT",
        type: "json",
        data: {
            ... details.index && {range_start: details.index},
            ... details.length && {range_length: details.length},
            ... details.insert && {insert_before: details.insert},
            ... details.snapshot_id && {snapshot_id: details.snapshot_id}
        }
    };

    const rq = await request (url, token, config);
    return true;
}

async function locate (trackID, userID, token, playlistIDs) {

    let tracks;

    if (!playlistIDs) {
        tracks = await getAll (userID, token);
    } else {
        tracks = await getSavedTracks (userID, token);

        items.forEach (item => {
            item.foundIn = "Library";
        });

        for (const playlist of playlistIDs) {
            const items = await getPlaylist (playlist, token);
            items.forEach (item => {
                item.foundIn = playlist;

                if (!tracks.map (track => track.id).includes (item.id)) {
                    tracks.push (item);
                }
            });
            tracks.push (items);
        }
    }

    const found = tracks.find (track => track.id === trackID);

    if (found) {
        return found;
    } else {
        return false;
    };
}

// Add a track to the queue
async function addToQueue (trackIDs, token, deviceID) {

    for (const trackID of trackIDs) {

        const query = queryString.stringify ({
            uri: "spotify:track:" + trackID,
            ... deviceID && {device: deviceID}
        });

        const url = `https://api.spotify.com/v1/me/player/queue?${query}`;

        const config = {
            method: "POST"
        };

        const rq = await request (url, token, {method: "POST"});
    }
    return true;
}

// Get playback
async function getPlayback (token) {
    const url = "https://api.spotify.com/v1/me/player?market=from_token";

    const rq = await request (url, token);
    return rq;
}

// Do something to the playback idk how this works
async function setPlayback (token, details) {
    const query = (details && details.deviceID) ? "?device_id=" + details.deviceID : "";

    const url = `https://api.spotify.com/v1/me/player/play${query}`;

    const config = {
        method: "PUT",
        type: "json",
        data: {
            ... details.context && {context_uri: details.context},
            ... details.uris && {uris: details.ids.map (id => "spotify:track:" + id)},
            ... details.offset && {offset: details.offset},
            ... details.position && {position_ms: details.position},
        }
    };

    const rq = await request (url, token, config);
    return true;
}

// Change a playlist's details
async function updateDetails (playlistID, token, details) {
    const url = `https://api.spotify.com/v1/playlists/${playlistID}`;

    const config = {
        method: "PUT",
        type: "json",
        data: {
            ... details.name && {name: details.name},
            ... details.description && {description: details.description},
            ... details.public && {public: details.public},
            ... details.collaborative && {collaborative: details.collaborative}
        }
    };

    const rq = await request (url, token, config);
    return true;
}

// Search Spotify for tracks, albums etc
async function search (query = {}, token) {

    const types = ["album", "artist", "playlist", "track", "show", "episode"];
    const filters = ["album", "artist", "track", "genre", "tag", "year"];

    const exampleQuery = {
        keywords: "say so",
        album: "hot pink",
        artist: "doja cat",
        track: "say so",
        genre: "pop",
        tag: "hipster", // Only returns 10% least popular albums
        tag: "new", // Only returns albums released in last 2 weeks
        year: "1980-2020",
        types: ["track"]
    };


    let q = [query.keywords].filter (Boolean);

    for (let filter in query) {

        if (filters.includes (filter)) {
            q.push ( filter + ":" + query[filter] );
        }

    };

    const queryParams = {
        ... q.length && {q: q.join (" ")},
        ... query.types && {type: query.types.join (",")},
        market: query.marker || "from_token",
        limit: 50,
        offset: 0
    }

    let url = `https://api.spotify.com/v1/search?${queryString.stringify (queryParams)}`;

    const results = await request (url, token);

    return results;
}

// Creates/Updates the "Discovery Channel" playlist, which appends every "Discover Weekly"
async function discover (userID, token) {
    const playlists = await getPlaylists (userID, token);

    let discovery = playlists.find (playlist => playlist.name === "Discovery Channel");
    const tracks = await getWeekly (userID, token);

    if (!tracks) {
        console.log ("Discover Weekly not followed");
        return false;
    }

    const pages = paginate (tracks, 100);

    for (let page of pages) {

        if (discovery) {
            let current = await getPlaylist (discovery.id, token);
            current = current.map (track => track.id);
            const recents = await getRecentlyListened ();

            page = page.filter (track => {
                if (!current.includes (track)) {
                    return track;
                };
            });

            if (page.length > 0) {
                await addTracks (discovery.id, token, page);
            };

        } else {
            const details = {
                name: "Discovery Channel",
                description: "A playlist containing every track in your 'Discover Weekly' playlists",
                // image: "",
                tracks: page
            };
            discovery = await createPlaylist (userID, token, details);
        }
    }

    return discovery.id;
}

// Returns the user's recently listen tracks
async function getRecentlyListened (token, details = {}) {

    let limit;

    if (details.limit && details.limit > 50) {
        limit = Math.floor (details.limit / 50) + 1;
    } else {
        limit = 1;
    };

    const query = queryString.stringify ({
        limit: details.limit || 50,
        ... details.after && {after: details.after},
        ... details.before && {before: details.before}
    });

    const url = `https://api.spotify.com/v1/me/player/recently-played?${query}`;

    return await iterative ({url, token, limit}, req => req.items.map (track => ({
        name: track.track.name,
            id: track.track.id,
            album: {
                name: track.track.album.name,
                id: track.track.album.id,
                artists: track.track.album.artists,
                images: track.track.album.images,
                length: track.track.album.total_tracks
            },
            artists: track.track.artists.map (artist => ({name: artist.name, id: artist.id})),
            preview_url: track.track.preview_url
    })));
}


// Finds every song in a user's library and playlists
async function getAll (userID, token) {
    const library = await getSavedTracks (userID, token);
    const playlists = await getPlaylists (userID, token);

    let tracks = library.map (track => ({name: track.name, id: track.id, foundIn: "Library"}));

    for (const playlist of playlists) {
        const items = await getPlaylist (playlist.id, token);

        items.forEach (track => {
            track.foundIn = playlist;
        });

        tracks.push (items);
    }

    tracks = [... new Set (tracks.flat())];

    const unique = [];
    const found = [];
    for (const track of tracks) {

        if (!found.includes (track.id)) {
            track.foundIn = tracks.filter (item => item.id === track.id).map (item => item.foundIn).flat();

            unique.push (track);
            found.push (track.id);
        }
    }

    return unique;
}

// Duplicates the user's saved songs library
async function everything (userID, token) {
    const library = await getSavedTracks (userID, token);
    const playlists = await getPlaylists (userID, token);

    const tracks = library.map (track => track.id);

    // for (const playlist of playlists) {
    //     console.log (`Getting ${playlist.name}`);
    //     const items = await getPlaylist (playlist.id, token);
    //     tracks.push (items.map (track => track.id));
    // }

    if (playlists.map (track => track.name).includes ("EVERYTHING")) {

        const id = playlists.find (playlist => playlist.name === "EVERYTHING").id;

        let current = await getPlaylist (id, token);
        current = current.map (track => track.id);

        const pages = paginate (tracks.flat(), 100);

        for (let page of pages) {

            page = page.filter (track => {
                if (!current.includes (track)) {
                    current.push (track);
                    return track;
                };
            });

            if (page.length > 0) {
                await addTracks (id, token, page.flat());
            };
        }


    } else {

        const details = {
            name: "EVERYTHING",
            description: "A playlist containing every track in your library, automatically generated from pure vibes"
        };

        const everthingID = await createPlaylist (userID, token, details);

        const pages = paginate (tracks, 100);

        for (const page of pages) {
            if (page.length > 0) {
                await addTracks (everthingID, token, page);
            };
        }

    }
}

// Removes all albums of length one from album library
async function purgeSinglesFromAlbumLibrary (token) {
    let library = await getSavedAlbums (token);

    library = library.filter (album => {
        if (album.length == 1) {
            return album;
        };
    });

    console.log (`Unsaving ${library.length} albums of length 1!`);

    return await unsaveAlbums (library.map (album => album.id), token);
}


module.exports = {
    requestAccess,
    refreshAccess,

    retrieveUser,
    getPlaylists,
    getSavedTracks,
    getSavedAlbums,
    getFollowedArtists,
    getTopTracks,
    getTopArtists,

    getPlaylist,
    getTracks,
    getAlbums,
    getWeekly,
    getAnalysis,
    getFeatures,
    getRecommendations,
    getRelatedArtists,

    createPlaylist,
    addPlaylistImage,
    addTracks,

    removeTracks,
    removeDuplicateTracks,

    isFollowingPlaylist,
    followPlaylist,
    followArtists,
    saveAlbums,
    saveTracks,
    followArtistsOfTracks,
    followArtistsOfPlaylist,
    saveAlbumsOfTracks,

    unfollowPlaylist,
    unsaveTracks,
    unsaveAlbums,

    replaceItems,
    reorderItems,
    locate,
    addToQueue,
    getPlayback,
    setPlayback,
    updateDetails,
    search,
    discover,
    getRecentlyListened,
    getAll,
    everything,
    purgeSinglesFromAlbumLibrary
};
