/*
  DigiReview external services configuration.

  After deploying the included Supabase Edge Functions, replace the blank
  values below. The Turnstile site key is public and is safe to place here.
  Never place the Turnstile secret or Supabase service-role key in this file.
*/
window.DIGIREVIEW_SERVICES = {
  extractorEndpoint: "",
  comments: {
    endpoint: "",
    turnstileSiteKey: ""
  }
};
