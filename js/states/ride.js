class Ride {
    description() { return "ride a boat" }

    stateMachine = null

    async enter(stateMachine, bot) {
        this.stateMachine.start(new Mounting())
    }

    async exit(stateMachine, bot) {
        if (this.stateMachine.currentState().exit) {
            this.stateMachine.currentState().exit(stateMachine, bot)
        }
    }

    async shouldDismount(stateMachine, bot) {
        this.stateMachine.transition(new Dismounting())
    }

    async mount(stateMachine, bot) {
        this.stateMachine.transition(new Riding())
    }

    async dismount(stateMachine, bot) {
        await stateMachine.pop()
    }
}

class Mounting {
    async enter(stateMachine, bot) {
        // Find nearest vehicle and attempt to mount
        const vehicle = bot.nearestEntity((entity) => {
            return entity.kind && entity.kind.match(/.*Vehicles.*/i)
        })
        bot.mount(vehicle)
    }
}

class Dismounting {
    async enter(stateMachine, bot) {
        try {
            bot.dismount()
            await stateMachine.pop()
        } catch (error) {
            // If we fail to dismount, just do it manually with sneak
            console.log(error)
        }
    }
}

// All transitions to and from this state are driven by events
class Riding {}

module.exports = { Ride }