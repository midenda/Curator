"use strict";

const axios = require ("axios");

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

    try {

        const rq = await axios (options);
        const status = rq.status;

        if (status >= 200 && status < 300) {
            // console.log (`Success, server responded with: ${status}`);
            const data = rq.data;

            return data;
        } else {
            console.log ("Status: " + status);
            throw status;
        }

    } catch (error) {
        console.log (error.message);
        console.log (error.response.data.error.message);
        // throw error;
    }
}

module.exports = request;
