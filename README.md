First make sure node version 22 and npm ins installed

Then run 
<code> npm install </code>
to install all the packages

If you want to run the dyno locally, make sure to install heroku and then
<code>heroku local</code>
You need to have the correct .env file with the following keys
<ul>
  <li>TWILIO_PHONE_NUMBER</li>
  <li>TWILIO_AUTH_TOKEN</li>
  <li>TWILIO_ACCOUNT_SID</li>
  <li>SENDGRID_FROM_EMAIL</li>
  <li>SENDGRID_API_KEY</li>
  <li>HIVEMQ_HOST</li>
  <li>HIVEMQ_USERNAME</li>
  <li>HIVEMQ_PASSWORD</li>
  <li>SINCH_PROJECT_ID</li>
  <li>SINCH_KEY_ID</li>
  <li>SINCH_KEY_SECRET</li>
  <li>SINCH_SMS_REGION</li>
  <li>SINCH_FROM_NUMBER</li>
</ul>


If you want to push to dyno, then make sure you are logged in to heroku and have correct access to the dyno and then
<code> git push heroku main </code>
You may need to specify the --app first time also need to push the above env variables
To see the logs
<code> heroku logs --tail --app="\<app-name\>"</code>

The scripts have two files, one to simulate actions of mqtt client that sends notifications to mqtt server and make sure server responds correctly and other simply to test sendgrid and sinch.




