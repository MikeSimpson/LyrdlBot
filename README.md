# LyrdlBot
## Usage
node lyrdlbot.js <SERVER_IP> <SERVER_PORT> <EMAIL_ADDRESS> <PASSWORD>
## Lyrdl Bot commands:
- **lb follow** -> make me follow you (WIP - cannot go through doors)
- **lb stop** -> make me return to idle state
- **lb get in** -> make me get in the nearest boat
- **lb get out** -> make me get out of a boat
- **lb step [forward|back|left|right]** -> make me take a step in the given direction
- **lb goto [x] [y] [z]** -> make me head to the given coords
- **lb goto [waypoint]** -> make me head to the given waypoint
- **lb waypoint [name] [x] [y] [z] [overworld|the_nether|the_end]** -> save a waypoint with the given name coords and dimmension (see waypoints in "memory.json")
- **lb sleep** -> make me sleep in the nearest bed
- **lb wake** -> make me wake up
- **lb take** -> make me take all items from the nearest chest
- **lb dump** -> make me dump all items in the nearest chest
- **lb gunpowder** -> send me on a mission to collect gunpowder
- **lb @** -> ask for my location
- **lb status** -> ask me how I'm feeling (WIP)
## On the roadmap:
- Handle doors
- Alphabetical item sorting
- Activate mob switch
- LLM interface
