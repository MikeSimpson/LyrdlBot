class Ride {
    description() { return "ride a boat" }

    stateMachine = null

    async enter(stateMachine, bot) {
        console.log("Entered Ride state");
        this.stateMachine.start(new Mounting());
    }

    async exit(stateMachine, bot) {
        console.log("Exited Ride state");
        this.stateMachine.currentState().exit(stateMachine, bot);
    }

    async shouldDismount(stateMachine, bot) {
        this.stateMachine.transition(new Dismounting());
    }

    async mount(stateMachine, bot) {
        this.stateMachine.transition(new Riding());
    }

    async dismount(stateMachine, bot) {
        await stateMachine.pop();
    }
}

class Mounting {
    async enter(stateMachine, bot) {
        console.log("Entered Mounting state");
        // Find nearest vehicle and attempt to mount
        const vehicle = bot.nearestEntity((entity) => {
            return entity.kind && entity.kind.match(/.*Vehicles.*/i)
        })
        bot.mount(vehicle)
    }
    async exit(stateMachine, bot) {
        console.log("Exited Mounting state");
    }
}

class Dismounting {
    async enter(stateMachine, bot) {
        console.log("Entered Dismounting state");
        try {
            bot.dismount();
            await stateMachine.pop();
        } catch (error) {
            // If we fail to dismount, just do it manually with sneak
            console.log(error)
        }
    }
    async exit(stateMachine, bot) {
        console.log("Exited Dismounting state");
    }
}

// All transitions to and from this state are driven by events
class Riding {
    async enter(stateMachine, bot) {
        console.log("Entered Riding state");
    }
    async exit(stateMachine, bot) {
        console.log("Exited Riding state");
    }
}

module.exports = { Ride };