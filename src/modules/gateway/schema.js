import mongoose from 'mongoose';

const GatewaySchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    verifiedRole: {
      type: String,
      required: true,
      description: 'Role ID to add when user is verified',
    },
    unverifiedRole: {
      type: String,
      required: true,
      description: 'Role ID to remove when user is verified (penalty role)',
    },
    channelId: {
      type: String,
      required: true,
      description: 'Channel where verification messages/buttons appear',
    },
    method: {
      type: String,
      enum: ['button', 'trigger', 'slash', 'join-check'],
      default: 'button',
      description: 'Primary verification method',
    },
    triggerWord: {
      type: String,
      default: '',
      description: 'Word/phrase that triggers verification (for trigger method)',
    },
    triggerEmoji: {
      type: String,
      default: '✅',
      description: 'Emoji used when trigger word is matched',
    },
    successDM: {
      type: String,
      default: 'You have been verified! Welcome to the server.',
      description: 'Private message sent to user upon successful verification',
    },
    embedTitle: {
      type: String,
      default: '🔐 Server Verification',
      description: 'Title for the verification embed sent to channel',
    },
    embedDescription: {
      type: String,
      default: 'Click the button below to verify your account and gain access to the server.',
      description: 'Description for the verification embed',
    },
    embedColor: {
      type: String,
      default: '#2ecc71',
      description: 'Hex color code for verification embeds (default: green)',
    },
    embedImage: {
      type: String,
      default: '',
      description: 'URL for banner/thumbnail image in verification embeds',
    },
    customResponses: {
      type: Map,
      of: String,
      default: new Map(),
      description: 'Custom messages for specific events (e.g., already_verified_button, already_verified_trigger)',
    },
    raidMode: {
      type: Boolean,
      default: false,
      description: 'If true, activates Account Age check (Raid Shield)',
    },
    minAccountAge: {
      type: Number,
      default: 7,
      description: 'Minimum account age in days required (if raidMode enabled)',
    },
    enabled: {
      type: Boolean,
      default: true,
      description: 'Whether the gateway module is enabled for this guild',
    },
  },
  {
    timestamps: true,
    collection: 'gateway_configs',
  }
);

export default mongoose.model('GatewayConfig', GatewaySchema);
