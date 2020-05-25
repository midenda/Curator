"use strict";

const mongoose = require ("mongoose");
const EventEmitter = require ("events");
const passportLocalMongoose = require ("passport-local-mongoose");
const LocalStrategy = require ("passport-local").Strategy;

let connected = false;


const userSchema = new mongoose.Schema ({

    username: {
        type: String,
        default: null
    },

    salt: {
        type: String,
        default: null
    },

    hash: {
        type: String,
        default: null
    },

    google_id: {
        type: String,
        default: null
    },

    spotify_id: {
        type: String,
        default: null
    },

    refresh_token: {
        type: String,
        required: function () { return !(this.spotify_id === null);}
    }

});

userSchema.plugin (passportLocalMongoose);

const User = mongoose.model ("User", userSchema);

// process.on ("warning", e => console.warn (e.stack));


class Monitor extends EventEmitter {


    async handleCallback (listener) {

        const data = new Promise (resolve => {

            this.once (listener, function report (result, error) {

                if (error || !result) {
                    resolve (error || false);
                    console.log (`${listener} failed with error (${error})`);
                } else {
                    resolve (result);
                    // console.log (listener + ": " + result);
                };

                appLink.removeListener (listener, report);
                return;
            });

        });

        return await data;
    }


    async addUser (user) {

        this.emit ("INTERACTION");
        interact ("CREATE", user);

        const data = await this.handleCallback ("CREATE");

        return data;
    }


    async register (user) {

        if (user.google_id || user.facebook_id || user.username) {

            this.emit ("INTERACTION");
            interact ("REGISTER", user);

            const data = await this.handleCallback ("REGISTER");

            return data;

        } else {
            return false;
        }
    }


    async find (id) {
        this.emit ("INTERACTION");
        interact ("FIND", id);

        const data = await this.handleCallback ("FIND");

        return data;
    }


    async login (username, password) {
        this.emit ("INTERACTION");
        interact ("LOGIN", {username, password});

        const data = await this.handleCallback ("LOGIN");

        return data;
    }


    async getUser (id = null) {

        this.emit ("INTERACTION");
        interact ("READ", id);

        const data = await this.handleCallback ("READ");

        if (!data || data.length === 0) {
            return false;
        } else {
            return data;
        }
    }


    async deleteUser (id) {

        this.emit ("INTERACTION");
        interact ("DELETE", id);

        const data = await this.handleCallback ("DELETE");

        return data;
    }


    async updateUser (user, newDetails) {

        this.emit ("INTERACTION");
        interact ("UPDATE", {user: user, details: newDetails});

        const data = await this.handleCallback ("UPDATE");

        return data;
    }

    // Removes all user records
    async _clearDB () {
        this.emit ("INTERACTION");
        interact ("DELETE", {});

        console.log ("Removing all documents");

        const data = await this.handleCallback ("DELETE");

        return data;
    }
}


const appLink = new Monitor;


async function interact (verb, args) {
    if (connected) {
        await main (verb, args);
    } else {
        await createConnection (verb, args);
    };
}


async function createConnection (verb, args) {

    try {
        mongoose.connect (process.env.ATLAS_URI, {
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

            appLink.once (verb, () => {
                if (!db._closeCalled && connected) {
                    closeConnection (db);
                };
            });

            await main (verb, args);

        db.once ("close", () => {
            db.removeAllListeners();
            appLink.removeAllListeners();
        });

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

            await User.create (args, (error, results) => {
                if (error) {
                    appLink.emit (verb, null, error);
                } else {
                    appLink.emit (verb, results, null);
                };
            });

            break;


        case "REGISTER":

            if (args.username && args.password) {
                await User.register ({username: args.username}, args.password, (error, user) => {
                    if (error) {
                        appLink.emit (verb, null, error);
                    } else {
                        appLink.emit (verb, user, null);
                    }
                });

            } else {
                await User.findOne (args, (error, results) => {
                    if (error) { return appLink.emit (verb, null, error); };

                    if (!results) {
                        appLink.emit (verb, true, null);
                        appLink.addUser (args);
                    } else {
                        appLink.emit (verb, results, null);
                    }

                });

            }

            break;


        case "LOGIN":

            await User.findOne ({username: args.username}, async (error, user) => {

                if (!user || error) {
                    appLink.emit (verb, null, error || new Error ("User not found"));
                } else {
                    const auth = await user.authenticate (args.password);
                    appLink.emit (verb, auth, null);
                };
            });

            break;


        case "FIND":

            await User.findById (args, (error, user) => {
                if (error) {
                    appLink.emit (verb, null, error);
                } else {
                    appLink.emit (verb, user, null);
                };
            });

            break;


        case "READ":

            filter = (typeof args == "object") ? args : (typeof args == "string") ? {spotify_id: args} : {};

            await User.find (filter, (error, results) => {
                if (error) {
                    appLink.emit (verb, null, error);
                } else {
                    appLink.emit (verb, results, null);
                }
            });

            break;


        case "UPDATE":

            let user = args.user;
            let newDetails = args.details;

            filter = (typeof user == "object") ? user : (typeof user == "string") ? {spotify_id: user} : {};

            await User.updateOne (filter, newDetails, function (error) {
                if (error) {
                    appLink.emit (verb, null, error);
                } else {
                    appLink.emit (verb, true, null);
                };
            });

            break;


        case "DELETE":

            filter = (typeof args == "object") ? args : (typeof args == "string") ? {spotify_id: args} : null;

            if (filter) {
                await User.deleteMany (filter, function (error) {
                    if (error) {
                        appLink.emit (verb, null, error);
                    } else {
                        appLink.emit (verb, true, null);
                    }
                });
            } else {
                appLink.emit (verb, null, new Error ("No Delete Filter Specified"));
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
            connection.close();
            connected = false;

            console.log ("Connection closed");
        }
    }, 10000);

    appLink.on ("INTERACTION", function refresh () {

        if (!connection._closeCalled) {
            timer.refresh();
        };

        if (appLink.listenerCount ("INTERACTION") > 1) {
            appLink.removeListener ("INTERACTION", refresh);
        };
    });
}

module.exports = appLink;
