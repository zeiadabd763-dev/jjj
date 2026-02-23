import mongoose from 'mongoose';

const GatewaySchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Core roles for all methods
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

    // Multi-method configuration - each method can be independently enabled
    methods: {
      button: {
        enabled: { type: Boolean, default: false },
        channel: { type: String, default: '' },
      },
      trigger: {
        enabled: { type: Boolean, default: false },
        channel: { type: String, default: '' },
        triggerWord: { type: String, default: '' },
      },
      slash: {
        enabled: { type: Boolean, default: false },
        channel: { type: String, default: '' },
      },
      join: {
        enabled: { type: Boolean, default: false },
      },
    },

    // Initial message customization per method (the prompt sent to channel)
    initialMessage: {
      button: {
        title: { type: String, default: '🔐 Server Verification' },
        desc: { type: String, default: 'Click the button below to verify your account.' },
        image: { type: String, default: '' },
      },
      trigger: {
        title: { type: String, default: '🔐 Server Verification' },
        desc: { type: String, default: 'Send the trigger word to verify your account.' },
        image: { type: String, default: '' },
      },
      slash: {
        title: { type: String, default: '🔐 Server Verification' },
        desc: { type: String, default: 'Use /verify to verify your account.' },
        image: { type: String, default: '' },
      },
      join: {
        title: { type: String, default: '🔐 Server Verification' },
        desc: { type: String, default: 'Welcome! You will be verified automatically.' },
        image: { type: String, default: '' },
      },
    },

    // DM customization
    dmUI: {
      title: { type: String, default: '✅ Welcome' },
      desc: { type: String, default: 'You have been verified! Welcome to the server.' },
      color: { type: String, default: '#2ecc71' },
      image: { type: String, default: '' },
    },

    // Prompt/Initial Message customization (overrides initialMessage)
    promptUI: {
      title: { type: String, default: '' },
      desc: { type: String, default: '' },
      color: { type: String, default: '' },
      image: { type: String, default: '' },
    },

    // Response page customization
    successUI: {
      title: { type: String, default: '✅ Success' },
      desc: { type: String, default: 'Verification successful! Welcome to the server.' },
      color: { type: String, default: '#2ecc71' },
      image: { type: String, default: '' },
    },
    alreadyVerifiedUI: {
      title: { type: String, default: '⏭️ Already Verified' },
      desc: { type: String, default: 'You are already verified in this server!' },
      color: { type: String, default: '#ffa500' },
      image: { type: String, default: '' },
    },
    errorUI: {
      title: { type: String, default: '❌ Error' },
      desc: { type: String, default: 'Verification failed.' },
      color: { type: String, default: '#ff0000' },
      image: { type: String, default: '' },
    },

    // Core settings
    enabled: {
      type: Boolean,
      default: true,
      description: 'Whether gateway is enabled for this guild',
    },

    raidMode: {
      type: Boolean,
      default: false,
      description: 'Enable account age validation (raid shield)',
    },
    minAccountAge: {
      type: Number,
      default: 7,
      description: 'Minimum account age in days for raid shield',
    },
  },
  { timestamps: true }
);

export default mongoose.model('GatewayConfig', GatewaySchema);
