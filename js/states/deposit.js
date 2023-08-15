class Deposit {
    description() { return "dump items in a chest" }

    async enter(stateMachine, bot) {
        console.log("Entered Dump");
        // put all items in nearest chest
        const chest = bot.findBlock({
            matching: bot.registry.blocksByName['chest'].id,
            maxDistance: 6
        })
        await putAll(bot, chest);
        await stateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Dump state");
    }
}

module.exports = { Deposit };