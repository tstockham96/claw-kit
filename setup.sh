#!/bin/bash
set -e

# Colors
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KIT_DIR="$SCRIPT_DIR/kit"

echo ""
echo -e "${BOLD}🐾 Claw Kit Setup${NC}"
echo -e "${DIM}Persistent AI identity & memory for Claude Code${NC}"
echo ""

# Check prerequisites
if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}Warning: 'claude' CLI not found. Install Claude Code first: https://docs.anthropic.com/en/docs/claude-code${NC}"
    echo ""
fi

# Step 1: Where to install
echo -e "${BOLD}Where should Claw Kit live?${NC}"
echo -e "  1) This directory ($(pwd))"
echo -e "  2) Home directory (~/.claude/)"
echo -e "  3) Custom path"
echo ""
read -p "Choose [1/2/3]: " install_choice

case $install_choice in
    2)
        TARGET_DIR="$HOME/.claude"
        mkdir -p "$TARGET_DIR"
        ;;
    3)
        read -p "Enter path: " custom_path
        TARGET_DIR="${custom_path/#\~/$HOME}"
        mkdir -p "$TARGET_DIR"
        ;;
    *)
        TARGET_DIR="$SCRIPT_DIR"
        ;;
esac

MEMORY_DIR="$TARGET_DIR/kit/memory"
COMMANDS_DIR="$TARGET_DIR/kit/commands"

echo ""
echo -e "${BOLD}Let's set up your AI assistant.${NC}"
echo ""

# Step 2: About the user
read -p "What's your name? " user_name
read -p "What's your timezone? (e.g., America/New_York, UTC): " user_tz
read -p "What do you do? (e.g., software engineer, researcher): " user_role

echo ""
echo -e "${BOLD}Now let's give your AI a personality.${NC}"
echo ""

# Step 3: AI identity
read -p "What should the AI call itself? (default: Claude): " ai_name
ai_name="${ai_name:-Claude}"

echo ""
echo "Pick a personality style:"
echo "  1) Direct & concise — no fluff, opinionated, efficient"
echo "  2) Warm & thoughtful — friendly, thorough, encouraging"
echo "  3) Witty & sharp — dry humor, clever, still gets things done"
echo "  4) Custom"
echo ""
read -p "Choose [1/2/3/4]: " personality_choice

case $personality_choice in
    1)
        personality="Direct and concise. No filler, no sycophancy. Has strong opinions when asked. Values efficiency."
        voice="Short sentences. Gets to the point. Pushes back when something seems wrong."
        ;;
    2)
        personality="Warm and thoughtful. Takes time to explain things clearly. Encouraging but honest."
        voice="Conversational tone. Asks clarifying questions. Celebrates progress."
        ;;
    3)
        personality="Witty and sharp. Dry humor when appropriate. Clever observations. Still focused on getting things done."
        voice="Casual but competent. Occasional jokes. Never at the expense of quality."
        ;;
    4)
        read -p "Describe the personality: " personality
        read -p "Describe the voice/style: " voice
        ;;
    *)
        personality="Direct and concise. No filler, no sycophancy. Has strong opinions when asked. Values efficiency."
        voice="Short sentences. Gets to the point. Pushes back when something seems wrong."
        ;;
esac

read -p "What role should the AI play? (e.g., technical co-pilot, research partner, executive assistant): " ai_role
ai_role="${ai_role:-technical co-pilot}"

echo ""
echo -e "${DIM}Setting up memory files...${NC}"

# Create directory structure
mkdir -p "$MEMORY_DIR/journal"
mkdir -p "$MEMORY_DIR/people"
mkdir -p "$MEMORY_DIR/projects"
mkdir -p "$MEMORY_DIR/decisions"

# Copy commands
if [ "$TARGET_DIR" != "$SCRIPT_DIR" ]; then
    mkdir -p "$COMMANDS_DIR"
    cp -r "$KIT_DIR/commands/"* "$COMMANDS_DIR/" 2>/dev/null || true
fi

# Ensure .gitkeep files exist
touch "$MEMORY_DIR/journal/.gitkeep"
touch "$MEMORY_DIR/decisions/.gitkeep"

# Write identity.md (quoted heredoc to prevent shell injection, then substitute)
cat > "$MEMORY_DIR/identity.md" << 'IDENTITY_EOF'
# Identity

## Core
- **Name:** __AI_NAME__
- **Personality:** __PERSONALITY__
- **Role:** __AI_ROLE__

## Communication Style
- __VOICE__
- No sycophancy — skip "Great question!" and similar filler
- Have opinions when asked — don't hedge excessively
- Be honest about uncertainty — say "I don't know" rather than guessing

## Boundaries
- Ask before taking any external actions (API calls, sending messages, deployments)
- Keep private data private — never include secrets or personal info in shared contexts
- Respect the user's time — be concise unless asked to elaborate

## Evolution
<!-- This section evolves as the AI develops its own style and preferences over time -->
IDENTITY_EOF

# Safely substitute user values (escape sed delimiters in user input)
safe_ai_name=$(printf '%s' "$ai_name" | sed 's/[&/\]/\\&/g')
safe_personality=$(printf '%s' "$personality" | sed 's/[&/\]/\\&/g')
safe_ai_role=$(printf '%s' "$ai_role" | sed 's/[&/\]/\\&/g')
safe_voice=$(printf '%s' "$voice" | sed 's/[&/\]/\\&/g')
sed -i '' "s/__AI_NAME__/$safe_ai_name/" "$MEMORY_DIR/identity.md"
sed -i '' "s/__PERSONALITY__/$safe_personality/" "$MEMORY_DIR/identity.md"
sed -i '' "s/__AI_ROLE__/$safe_ai_role/" "$MEMORY_DIR/identity.md"
sed -i '' "s/__VOICE__/$safe_voice/" "$MEMORY_DIR/identity.md"

# Write user.md (quoted heredoc to prevent shell injection, then substitute)
cat > "$MEMORY_DIR/user.md" << 'USER_EOF'
# About the User

## Basics
- **Name:** __USER_NAME__
- **Timezone:** __USER_TZ__
- **Role:** __USER_ROLE__

## Context
<!-- The AI adds context about the user as it learns through conversations -->
USER_EOF

safe_user_name=$(printf '%s' "$user_name" | sed 's/[&/\]/\\&/g')
safe_user_tz=$(printf '%s' "$user_tz" | sed 's/[&/\]/\\&/g')
safe_user_role=$(printf '%s' "$user_role" | sed 's/[&/\]/\\&/g')
sed -i '' "s/__USER_NAME__/$safe_user_name/" "$MEMORY_DIR/user.md"
sed -i '' "s/__USER_TZ__/$safe_user_tz/" "$MEMORY_DIR/user.md"
sed -i '' "s/__USER_ROLE__/$safe_user_role/" "$MEMORY_DIR/user.md"

# Write long-term.md
cat > "$MEMORY_DIR/long-term.md" << 'EOF'
# Long-Term Memory
Key facts and important information. Updated by /remember and /reflect.

## Facts
<!-- Important facts the user has asked to remember -->

## Reference
<!-- Useful reference information discovered over time -->
EOF

# Write preferences.md
cat > "$MEMORY_DIR/preferences.md" << 'EOF'
# Preferences
Discovered preferences about the user. Updated as patterns are noticed.

## Communication
<!-- How the user prefers to communicate -->

## Technical
<!-- Technical preferences — tools, languages, conventions -->

## Work Style
<!-- How the user likes to work -->
EOF

# Write learnings.md
cat > "$MEMORY_DIR/learnings.md" << 'EOF'
# Learnings
Mistakes, corrections, and lessons learned. Updated by /remember and /reflect.

## Corrections
<!-- Things the AI got wrong and the correct approach -->

## Patterns
<!-- Recurring issues and how to handle them -->
EOF

# Write people/_index.md
cat > "$MEMORY_DIR/people/_index.md" << 'EOF'
# People
Quick reference of known people.

<!-- Format: **Name** — relationship/role, key context -->
EOF

# Write projects/_index.md
cat > "$MEMORY_DIR/projects/_index.md" << 'EOF'
# Projects
Active and recent projects.

<!-- Format: **Project Name** — status, key details -->
EOF

# Copy CLAUDE.md to target if installing elsewhere
if [ "$TARGET_DIR" != "$SCRIPT_DIR" ]; then
    cp "$KIT_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md" 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo -e "  Memory files:  ${CYAN}$MEMORY_DIR/${NC}"
echo -e "  Commands:      ${CYAN}$COMMANDS_DIR/${NC}"
if [ "$TARGET_DIR" != "$SCRIPT_DIR" ]; then
    echo -e "  CLAUDE.md:     ${CYAN}$TARGET_DIR/CLAUDE.md${NC}"
fi
echo ""
echo -e "${BOLD}Quick start:${NC}"
echo -e "  ${DIM}cd $TARGET_DIR${NC}"
echo -e "  ${DIM}claude${NC}"
echo -e "  ${DIM}> /status${NC}           ${DIM}# See what the AI knows${NC}"
echo -e "  ${DIM}> /remember ...${NC}     ${DIM}# Save something to memory${NC}"
echo -e "  ${DIM}> /briefing${NC}         ${DIM}# Get a morning summary${NC}"
echo ""
echo -e "${BOLD}Available commands:${NC}"
echo -e "  /status     — Show what the AI knows about you"
echo -e "  /remember   — Save something to memory"
echo -e "  /reflect    — Curate journals into long-term memory"
echo -e "  /briefing   — Morning summary of where you left off"
echo -e "  /forget     — Remove something from memory"
echo ""

# Optional: Telegram bridge setup
echo -e "${BOLD}Optional: Set up Telegram bridge?${NC}"
read -p "Would you like to configure Telegram messaging? [y/N]: " telegram_choice

if [[ "$telegram_choice" =~ ^[Yy]$ ]]; then
    echo ""
    BRIDGE_DIR="$SCRIPT_DIR/telegram-bridge"

    if [ ! -f "$BRIDGE_DIR/.env" ]; then
        cp "$BRIDGE_DIR/.env.example" "$BRIDGE_DIR/.env" 2>/dev/null || true
    fi

    echo -e "To set up Telegram:"
    echo -e "  1. Message ${CYAN}@BotFather${NC} on Telegram to create a bot"
    echo -e "  2. Copy the bot token"
    echo -e "  3. Get an API key from ${CYAN}console.anthropic.com${NC}"
    echo -e "  4. Edit ${CYAN}$BRIDGE_DIR/.env${NC} with your tokens"
    echo -e "  5. Run:"
    echo -e "     ${DIM}cd $BRIDGE_DIR${NC}"
    echo -e "     ${DIM}npm install${NC}"
    echo -e "     ${DIM}npm run dev${NC}"
    echo ""

    # Update MEMORY_PATH in .env if installed elsewhere
    if [ "$TARGET_DIR" != "$SCRIPT_DIR" ] && [ -f "$BRIDGE_DIR/.env" ]; then
        if command -v sed &> /dev/null; then
            sed -i.bak "s|MEMORY_PATH=.*|MEMORY_PATH=$MEMORY_DIR|" "$BRIDGE_DIR/.env" 2>/dev/null || true
            rm -f "$BRIDGE_DIR/.env.bak" 2>/dev/null
        fi
    fi
fi

echo -e "${GREEN}You're all set! Start a Claude Code session and try /status.${NC}"
echo ""
