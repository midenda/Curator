"use strict";

function compare (object1, object2, order = null) {

    if (order == null) {

        for (const property in object1) {

            if (object1 [property] > object2 [property]) {
                return 1;
            } else if (object1 [property] < object2 [property]) {
                return -1;
            };

        };

    } else if (typeof (order) == "object") {

        for (const property of order) {

            if (object1 [property] > object2 [property]) {
                return 1;
            } else if (object1 [property] < object2 [property]) {
                return -1;
            };

        };

    } else {
        throw TypeError ("'order' must be array or null");
    };

    return 0;

}

module.exports = {
    compare
};
