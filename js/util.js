const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const { GoalNear } = require('mineflayer-pathfinder').goals
const fileStream = require('fs')

async function move(bot, position, range, scaffold) {
    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    defaultMove.allow1by1towers = false
    defaultMove.scafoldingBlocks.push(bot.registry.itemsByName['deepslate'].id)
    defaultMove.placeCost = scaffold ? 1 : 1000000
    defaultMove.allowFreeMotion = true

    // Start following the target
    bot.pathfinder.setMovements(defaultMove)
    bot.pathfinder.setGoal(new GoalNear(position.x, position.y, position.z, range ?? 1))
}

async function takeAll(bot, chestBlock, regex) {

    const window = await bot.openContainer(chestBlock)

    for (const item of window.containerItems()) {
        if (!regex || item.name.match(new RegExp(regex))) {
            await withdrawItem(item, item.count)
        }
    }

    window.close()

    async function withdrawItem(item, amount) {
        if (item) {
            try {
                await window.withdraw(item.type, null, amount, null)
                console.log(`withdrew ${amount} ${item.name}`)
            } catch (err) {
                console.log(`unable to withdraw ${amount} ${item.name}`)
            }
        } else {
            console.log(`unknown item ${name}`)
        }
    }
}

// Put everything not in the hotbar into target chest
async function putAll(bot, chest, regex) {

    const window = await bot.openContainer(chest)

    for (const item of window.items()) {
        if (!regex || item.name.match(new RegExp(regex))) {
            await depositItem(item, item.count)
        }
    }

    window.close()

    async function depositItem(item, amount) {
        if (item) {
            try {
                await window.deposit(item.type, null, amount)
                console.log(`deposited ${amount} ${item.name}`)
            } catch (err) {
                console.log(`unable to deposit ${amount} ${item.name}`)
            }
        } else {
            console.log(`unknown item ${name}`)
        }
    }
}

async function dropAll(bot, regex) {

    for (const item of bot.inventory.items()) {
        if (!regex || item.name.match(new RegExp(regex))) {
            await dropItem(item, item.count)
        }
    }

    async function dropItem(item, amount) {
        if (item) {
            try {
                await bot.toss(item.type, null, amount)
                console.log(`drop ${amount} ${item.name}`)
            } catch (err) {
                console.log(err)
                console.log(`unable to drop ${amount} ${item.name}`)
            }
        } else {
            console.log(`unknown item ${name}`)
        }
    }
}

// Prepend time stamp and write message to log file and console
const log = (message) => {
    let stampedMessage = `${new Date().toLocaleString("en-UK")}: ${message}\n`
    fileStream.appendFile('logs.txt', stampedMessage, function (err) {
        if (err) throw err
    })
    console.log(stampedMessage)
}

// Read command line text and post it as a message in game
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
})

const prompt = (bot) => {
    readline.question('', msg => {
        bot.chat(msg)
        prompt(bot)
    })
}

async function readMemory() {
    const data = fileStream.readFileSync('memory.json', 'utf-8', callback_function = function (err) {
        if (err) throw err
    })
    const memory = JSON.parse(data)
    return memory
}

function updateMemory(update) {
    fileStream.readFile('memory.json', 'utf-8', callback_function = function (err, data) {
        if (err) throw err
        const memory = JSON.parse(data)
        fileStream.writeFile('memory.json', JSON.stringify(update(memory)), function (err) {
            if (err) throw err
        })

    })
}

async function getStatus(stateMachine, bot) {
    const carrotCount = bot.inventory.items().filter(item => item.name == 'golden_carrot').reduce((partialSum, slot) => partialSum + slot.count, 0)
    return {
        efficiency: ((bot.health / 20) * 100).toFixed() + "%",
        powerLevel: (((bot.food + carrotCount * 14) / 916) * 100).toFixed() + "%",
        location: {
            x: bot.entity.position.x.toFixed(),
            y: bot.entity.position.y.toFixed(),
            z: bot.entity.position.z.toFixed(),
            dimension: bot.game.dimension,
        },
        task: stateMachine.currentState() ? stateMachine.currentState().description() : "Booting up",
        // waypoints: (await readMemory()).waypoints
    }
}

module.exports = { move, takeAll, putAll, dropAll, log, prompt, readMemory, getStatus, updateMemory }