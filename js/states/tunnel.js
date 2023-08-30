const { Dig } = require('./dig')

class Tunnel {

    constructor(extras) {
        this.extras = extras
    }

    description() { return "digging a tunnel" }

    extras = {
        cornerA: null,
        cornerB: null,
        directionPositive: null,
        staircase: null
    }

    x = null
    z = null
    yOffset = null

    async enter(stateMachine, bot) {
        if (this.yOffset === null) {
            this.yOffset = 0
        }
        // Figure out which axis we are tunnelling along
        if (this.extras.cornerA.x == this.extras.cornerB.x) {
            // axis is x
            if (this.x === null) {
                this.x = this.extras.cornerA.x
            }
            var startY = Math.min(this.extras.cornerA.y + this.yOffset, this.extras.cornerB.y + this.yOffset)
            var endY = Math.max(this.extras.cornerA.y + this.yOffset, this.extras.cornerB.y + this.yOffset)
            var startZ = Math.min(this.extras.cornerA.z, this.extras.cornerB.z)
            var endZ = Math.max(this.extras.cornerA.z, this.extras.cornerB.z)
            // push dig tasks one layer at a time  
            for (let y = endY; y >= startY; y--) {
                if (y % 2 == 0) {
                    console.log("Zig")
                    for (let z = startZ; z <= endZ; z++) {
                        // console.log("Pushing " + this.x + " " + y + " " + z)
                        await stateMachine.push(new Dig({
                            coordinates: { x: this.x, y: y, z: z },
                            scaffold: true
                        }))
                    }
                } else {
                    console.log("Zag")
                    for (let z = endZ; z >= startZ; z--) {
                        // console.log("Pushing " + this.x + " " + y + " " + z)
                        await stateMachine.push(new Dig({
                            coordinates: { x: this.x, y: y, z: z },
                            scaffold: true
                        }))
                    }
                }
            }
            if(this.extras.directionPositive){
                this.x++
            } else {
                this.x--
            }
        } else {
            // axis is z
            if (this.z === null) {
                this.z = this.extras.cornerA.z
            }
            var startX = Math.min(this.extras.cornerA.x, this.extras.cornerB.x)
            var endX = Math.max(this.extras.cornerA.x, this.extras.cornerB.x)
            var startY = Math.min(this.extras.cornerA.y + this.yOffset, this.extras.cornerB.y + this.yOffset)
            var endY = Math.max(this.extras.cornerA.y + this.yOffset, this.extras.cornerB.y + this.yOffset)
            // push dig tasks one layer at a time  
            for (let y = endY; y >= startY; y--) {
                if (y % 2 == 0) {
                    console.log("Zig")
                    for (let x = startX; x <= endX; x++) {
                        // console.log("Pushing " + x + " " + y + " " + this.z)
                        await stateMachine.push(new Dig({
                            coordinates: { x: x, y: y, z: this.z },
                            scaffold: true
                        }))
                    }
                } else {
                    console.log("Zag")
                    for (let x = endX; x >= startX; x--) {
                        // console.log("Pushing " + x + " " + y + " " + this.z)
                        await stateMachine.push(new Dig({
                            coordinates: { x: x, y: y, z: this.z },
                            scaffold: true
                        }))
                    }
                }
            }
            if(this.extras.directionPositive){
                this.z++
            } else {
                this.z--
            }
        }
        if(this.extras.staircase){
            this.yOffset += this.extras.staircase
        }
        await stateMachine.currentState().enter(stateMachine, bot)
    }
}

module.exports = { Tunnel }