
const express = require('express');
const router = express.Router();
const stripeWebhook = require('../controllers/webhook');

// Stripe webhook endpoint
router.post('/stripe', express.raw({type: 'application/json'}), stripeWebhook.handle);

module.exports = router;
