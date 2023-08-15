class Take {
    description() { return "take items from a chest" }

    async enter(stateMachine, bot) {
        console.log("Entered Take");
        // take all items from nearest chest
        const chest = bot.findBlock({
            matching: bot.registry.blocksByName['chest'].id,
            maxDistance: 6
        })
        await takeAll(bot, chest);
        await stateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Take state");
    }
}

module.exports = { Take };