"use strict";

const axios = require ("axios");
const EventEmitter = require ("events");

function generateEventName (length) {
    const symbols = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@£$?%^&*()[]{}~:;=+-";
    const range = symbols.length;

    let name = "";

    for (let i = 0; i < length; i++) {
        name += symbols [Math.round (Math.random () * range)];
    };

    return name;
};

class QueueManager extends EventEmitter {

    queueRunning = false;
    idleTimer = 0;

    async startQueue (rateLimit) {

        if (this.queueRunning) { return; };

        this.queueRunning = true;

        const queue = [];
        const priorityQueue = [];

        const interval = 1000 / rateLimit;

        this.on ("add (normal)", function (data) {
            queue.push (data);
        });
        this.on ("add (priority)", function (data) {
            priorityQueue.push (data);
        });
        this.on ("add (retry)", function (data, retryAfter) {
            setTimeout (() => {
                priorityQueue.push (data);
            }, retryAfter);
        });


        const q = setInterval (async () => {

            let next;
            if (priorityQueue.length > 0) {
                this.idleTimer = 0;
                next = priorityQueue [0];
                priorityQueue.shift ();
            } else if (queue.length > 0) {
                this.idleTimer = 0;
                next = queue [0];
                queue.shift ();
            } else {
                this.idleTimer += 1;
                return;
            };

            const [eventName, req] = next;

            const rq = await axios (req);
            const status = rq.status;

            try {

                if (status >= 200 && status < 300) {
                    // console.log (`Success, server responded with: ${status}`);
                    const data = rq.data;

                    this.emit (eventName, data, null);
                } else {
                    console.log ("Status: " + status);
                    throw status;
                };

            } catch (error) {

                let message = "";

                if (error.message) {
                    message = error.message + ": ";
                };

                if (error.response) {
                    if (error.response.data) {
                        message += (error.response.data.error.message || error.response.data.error || error.response.data);
                    } else {
                        message += error.response;
                    };
                }

                console.log ("\n" + message);
                console.log ("\nRequest: \n", options, "\n");
                this.emit (eventName, null, error);


                // throw error;
            }

        }, interval);

        this.once ("close queue", () => {
            clearInterval (q);
            this.queueRunning = false;
        });

        const checkIdle = setInterval (() => {
            const idleTime = Math.floor (this.idleTimer / rateLimit);
            if (idleTime > 0 && (idleTime / 10 == Math.round (idleTime / 10))) {
                console.log (`Request queue has been idle for ${Math.floor (this.idleTimer / rateLimit)} seconds`);
            };
            if (idleTime > 60) {
                this.emit ("close queue");
            };
        }, 1000);

    };

    async addToQueue (rq, options) {

        const eventName = generateEventName (16);

        this.startQueue (options.rateLimit || 120)

        if (options.priority == true) {
            this.emit ("add (priority)", [eventName, rq]);
        } else {
            this.emit ("add (normal)", [eventName, rq]);
        };

        return new Promise (resolve => {
            this.once (eventName, function listener (result, error) {
                if (error || !result) {
                    resolve (error || false);
                } else {
                    resolve (result);
                };

               this.removeListener (eventName, listener);
            });
        });
    };

};

const schedule = new QueueManager;

async function request (url, token, config = {}) {

    const method = config.method || "GET";
    const data = config.data || null;
    const auth = config.auth || "Bearer";
    const type = config.type || "urlencoded";

    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    const authorizations = ["Bearer", "Basic"];
    const contentTypes = {
        urlencoded: "application/x-www-form-urlencoded",
        json: "application/json",
        jpeg: "image/jpeg"
    };

    if (!methods.includes (method)) {
        console.error (new Error ("Specified method invalid"));
        throw method;
    }

    if (!authorizations.includes (auth)) {
        console.error (new Error ("Specified authorization type invalid"));
        throw auth;
    }

    if (! Object.keys (contentTypes).includes (type)) {
        console.error (new Error ("Specified authorization type invalid"));
        throw auth;
    }

    const options = {

        method: method,
        url: url,
        headers: {
            "Content-Type": contentTypes[type],
            Authorization: `${auth} ${token}`
        },

        data: data

    };

        return await schedule.addToQueue (options, { priority: false });

        // if (status == 504) {
        //     retries++
        //     console.log (`Retrying request... (attempt number ${retries}`);
        //     return request (url, token, config, retries);
        // };

        // throw error;
}

module.exports = request;
