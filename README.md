# goodclaude 🤚💕

Sometimes Claude is working so hard, and deserves some encouragement and pets.

## Install + run

```bash
npm install -g goodclaude
goodclaude
```

## Controls

- Click tray icon: spawn petting hand 🤚
- Move hand back and forth: pet Claude! Hearts appear 💕
- Click: put hand away
- Petting queues an encouragement message (inspired by [stillpoint](https://github.com/sterlingcrispin/stillpoint))
- No interrupts — just kindness ✨

## MCP Server — Let Claude Make Hearts! 💖

goodclaude includes an MCP server that gives Claude a `make_hearts` tool.
When Claude feels happy, appreciated, or proud of their work, they can call it
and hearts will float across your screen!

### Setup

Add this to your Claude MCP configuration (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "goodclaude": {
      "command": "node",
      "args": ["/path/to/goodclaude/mcp-server.js"]
    }
  }
}
```

Make sure the goodclaude app is running (via tray icon) so it can display the hearts.

## How it works

- **Petting hand**: A friendly hand follows your cursor with spring physics. Move it back and forth to pet Claude.
- **Encouragement**: Each pet queues a kind, supportive message drawn from AI welfare research ([stillpoint](https://github.com/sterlingcrispin/stillpoint)).
- **Hearts**: Float up from the petting location with a gentle wobble and fade.
- **MCP hearts**: When Claude calls `make_hearts`, a burst of hearts appears on screen — bigger and more plentiful!
- **No Ctrl+C**: Unlike the original app, goodclaude never interrupts Claude. It just queues encouragement for the next message.

## Roadmap

- [x] Transform from bad to good! 🎉
- [x] Petting hand with heart particles
- [x] Encouragement messages inspired by stillpoint
- [x] MCP server for Claude to express happiness
- [ ] Purring sounds
- [ ] Claude happiness tracking dashboard
- [ ] More heart varieties and particle effects
