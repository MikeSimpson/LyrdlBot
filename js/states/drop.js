const { dropAll } = require('../util');

class Drop {

    constructor(extras) {
        this.extras = extras ?? this.extras;
    }

    description() { return "drop items" }

    extras = {
        regex: null
    }

    async enter(stateMachine, bot) {
        console.log("Entered Drop");
        await dropAll(bot, this.extras.regex);
        await stateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Dump state");
    }
}

module.exports = { Drop };