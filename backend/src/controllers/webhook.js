
const stripe = require('../services/stripe');
const config = require('../config');
const { Order, Donation } = require('../models');

// Handle Stripe webhooks securely using the webhook signing secret
exports.handle = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event;

  try {
    if(webhookSecret){
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // If no webhook secret provided (development), parse the raw body
      event = req.body;
    }
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event types we're interested in
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const metadata = session.metadata || {};
        // If metadata contains orderId or donationId, update accordingly
        if(metadata.orderId){
          await Order.update({ status: 'paid' }, { where: { id: metadata.orderId } });
          console.log('Order marked paid:', metadata.orderId);
        }
        if(metadata.donationId){
          await Donation.update({ }, { where: { id: metadata.donationId } });
          console.log('Donation recorded:', metadata.donationId);
        }
        break;
      }
      case 'payment_intent.succeeded': {
        // Optionally handle other events
        break;
      }
      default:
        // Unexpected event type
    }
  } catch (err){
    console.error('Error handling webhook event', err);
  }

  res.json({ received: true });
};
