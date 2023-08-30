const { dropAll } = require('../util')

class Drop {

    constructor(extras) {
        this.extras = extras ?? this.extras
    }

    description() { return "drop items" }

    extras = {
        regex: null
    }

    async enter(stateMachine, bot) {
        await dropAll(bot, this.extras.regex)
        await stateMachine.pop()
    }
}

module.exports = { Drop }