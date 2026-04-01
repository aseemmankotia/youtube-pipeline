/**
 * Email Notification Utility — EmailJS
 * Sends a summary email after each successful YouTube upload.
 * EmailJS runs entirely in the browser — no backend required.
 *
 * The emailjs global is loaded from CDN in index.html.
 */

export async function sendEmailSummary({ topic, youtubeUrl, scriptExcerpt, date, settings }) {
  const { emailjsServiceId, emailjsTemplateId, emailjsPublicKey, recipientEmail } = settings;
  if (!emailjsPublicKey || !emailjsServiceId || !emailjsTemplateId || !recipientEmail) return;

  if (typeof emailjs === 'undefined') {
    throw new Error('EmailJS SDK not loaded — check your internet connection.');
  }

  emailjs.init({ publicKey: emailjsPublicKey });

  await emailjs.send(emailjsServiceId, emailjsTemplateId, {
    to_email:       recipientEmail,
    subject:        `✅ New video uploaded: ${topic || 'Untitled'}`,
    topic:          topic || 'Untitled',
    youtube_url:    youtubeUrl || 'N/A',
    script_excerpt: (scriptExcerpt || '').slice(0, 500),
    date:           date || new Date().toLocaleString(),
  });
}
