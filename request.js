"use strict";

const axios = require ("axios");

async function request (url, token, method = "GET", postBody = null, auth = "Bearer", type = "x-www-form-urlencoded") {

    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    const authorizations = ["Bearer", "Basic"];

    if (!methods.includes (method)) {
        console.error (new Error ("Specified method invalid"));
        throw method;
    }

    if (!authorizations.includes (auth)) {
        console.error (new Error ("Specified authorization type invalid"));
        throw auth;
    }

    const options = {

        method: method,
        url: url,
        headers: {
            "Content-Type": "application/" + type,
            Authorization: `${auth} ${token}`
        },

        data: postBody

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
        console.error (error.message);
        throw error;
    }
}

module.exports = request;
