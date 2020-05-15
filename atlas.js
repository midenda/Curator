"use strict";

const mongoose = require ("mongoose");
const EventEmitter = require('events');
const fs = require ("fs");

const uri = JSON.parse (fs.readFileSync (__dirname + "/private/secrets.json", "utf-8", (err, data) => {
    if (err) {
        throw err;
    };
    return data;
})).atlasURI;

let connected = false;

const vibeSchema = new mongoose.Schema ({

    name: String

});

const Vibe = mongoose.model ("Vibe", vibeSchema);


const userSchema = new mongoose.Schema ({

    spotify_id: {
        type: String,
        required: true,
        unique: true
    },

    refresh_token: {
        type: String,
        required: true
    },

    preferred_vibes: [Object]

});

const User = mongoose.model ("User", userSchema);


class Monitor extends EventEmitter {


    async handleCallback () {

        const data = new Promise (resolve => {

            this.once ("COMPLETE", (verb, result) => {
                // console.log (verb + ": " + result);
                resolve (result);
            });

            this.once ("FAIL", verb => {
                console.log ("Failed:", verb)
                resolve (false)
            });

        });

        return await data;
    }


    async report (verb, result = null) {

        if (result) {
            this.emit ("COMPLETE", verb, result);
        } else {
            this.emit ("FAIL", verb);
        };
    }


    async addUser (user) {

        this.emit ("INTERACTION");
        createConnection("CREATE", user);

        const data = await this.handleCallback();

        return data;
    }


    async getUser (id = null) {

        this.emit ("INTERACTION");
        createConnection("READ", id);

        const data = await this.handleCallback();

        if (!data || data.length === 0) {
            return false
        } else {
            return data;
        }
    }


    async deleteUser (id) {

        this.emit ("INTERACTION");
        createConnection("DELETE", id);

        const data = await this.handleCallback();

        return data;
    }


    async updateUser (user, newDetails) {

        this.emit ("INTERACTION");
        createConnection("UPDATE", [user, newDetails]);

        const data = await this.handleCallback();

        return data;
    }

}


const appLink = new Monitor;


async function createConnection (verb, args) {

    try {
        mongoose.connect (uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useCreateIndex: true
        });

        const db = mongoose.connection;

        db.on ("error", error => {
            console.log (error);
        });

        db.once ("open", async () => {

            if (!connected) {
                console.log ("Connection established");
                connected = true;
            };

            appLink.once ("COMPLETE", () => {
                if (!db._closeCalled && connected) {
                    closeConnection (db);
                };
            });

            await main (verb, args);

        });

        return true;

    } catch (error) {
        console.log (error);
    }

}


async function main (verb, args) {

    let filter;

    switch (verb) {


        case "CREATE":

            await User.create (args, function (error, results) {
                if (error) {
                    appLink.report (verb);
                } else {
                    appLink.report (verb, results);
                };
            });

            break;


        case "READ":

            filter = (typeof args == "object") ? args : (typeof args == "string") ? {spotify_id: args} : {};

            await User.find (filter, function (error, results) {
                if (error) {
                    appLink.report (verb);
                } else {
                    appLink.report (verb, results);
                }
            });

            break;


        case "UPDATE":

            let user = args[0];
            let newDetails = args[1];

            filter = (typeof user == "object") ? user : (typeof user == "string") ? {spotify_id: user} : {};

            await User.updateOne (filter, newDetails, function (error) {
                if (error) {
                    appLink.report (verb);
                } else {
                    appLink.report (verb, true);
                };
            });

            break;


        case "DELETE":

            filter = (typeof args == "object") ? args : (typeof args == "string") ? {spotify_id: args} : null;

            if (filter) {
                await User.deleteMany (filter, function (error) {
                    if (error) {
                        appLink.report (verb);
                    } else {
                        appLink.report (verb, true);
                    }
                });
            } else {
                appLink.report (verb);
            }

            break;


        default:
            console.log ("Error: Verb Unknown");
            break;

    };

}


// Closes the MongoDB Atlas connection after 10 seconds of inactivity
async function closeConnection (connection) {

    const timer = setTimeout (() => {
        if (!connection._closeCalled) {
            connection.close()
            connected = false;
            console.log ("Connection closed");
        }
    }, 10000);

    appLink.on ("INTERACTION", () => {

        if (!connection._closeCalled) {
            timer.refresh();
        };

    });
}



module.exports = appLink;
