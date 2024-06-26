/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


const castv2 = require('castv2');

const HOME_SCREEN_APP_ID = 'E8C28D3C';
const SERIAL_NUMBER_APP_ID = '39B1F81E';

// Makes it more obvious why we multiply timeouts by 1000 for setTimeout.
const MILLISECONDS_PER_SECOND = 1000;

const Mode = {
  HOME: 0,
  URL: 1,
  SERIAL_NUMBER: 2,
};

/**
 * Uses the Cast v2 protocol to connect to a Chromecast device and start a
 * receiver app or close the running app and go back to the Chromecast home
 * screen.
 *
 * @param {!object<string, ?>} flags Parsed command-line flags.
 * @param {Console} log A Console-like interface for logging.  Can be "console".
 * @param {Mode} mode A Mode constant, such as Mode.HOME or Mode.URL.
 * @param {?string} url Required for Mode.URL, ignored otherwise.
 * @return {!Promise}
 */
function cast(flags, log, mode, url) {
  return new Promise((resolve, reject) => {
    // Hostname is in one of the following forms:
    //   "hostname-or-ip"
    //   "hostname-or-ip:port"
    const host = flags.hostname.split(':')[0];
    const port = parseInt(flags.hostname.split(':')[1], 10) || 8009;

    const client = new castv2.Client();
    const options = {
      host,
      port,
    };

    client.on('error', (error) => {
      reject(error);
    });

    client.connect(options, () => {
      // Create the "connection" message channel.  We must send a message on
      // this channel to establish a "virtual connection" before we are
      // allowed to communicate with the receiver on another channel.
      // See https://www.npmjs.com/package/castv2#communicating-with-receivers
      const connection = client.createChannel(
          'sender-0', 'receiver-0',
          'urn:x-cast:com.google.cast.tp.connection', 'JSON');

      // Establish the "virtual connection".
      connection.send({type: 'CONNECT'});

      // Create the "receiver" message channel.  We must send a message on
      // this channel to start the desired receiver app.  We will also get
      // back messages on this channel telling us the status of the device and
      // the receiver app we launched.
      // See https://www.npmjs.com/package/castv2#communicating-with-receivers
      const receiver = client.createChannel(
          'sender-0', 'receiver-0',
          'urn:x-cast:com.google.cast.receiver', 'JSON');

      const request = {
        // The requestId is essentially arbitrary since we only send one
        // request.  The protocol sends a reply back with the same ID.
        requestId: 1,
      };

      switch (mode) {
        case Mode.URL:
          request.type = 'LAUNCH';
          request.appId = flags.receiverAppId;
          // This is substituted in place of ${POST_DATA} in the registered
          // receiver URL.
          request.commandParameters = JSON.stringify({
            url,
            redirect: flags.redirect,
          });
          break;

        case Mode.SERIAL_NUMBER:
          request.type = 'LAUNCH';
          request.appId = SERIAL_NUMBER_APP_ID;
          break;

        case Mode.HOME:
        default:
          request.type = 'STOP';
          break;
      }

      receiver.send(request);

      // Set up a timeout.
      const connectionTimer = setTimeout(() => {
        reject(new Error('Timeout waiting for Chromecast to load!'));
      }, flags.connectionTimeoutSeconds * MILLISECONDS_PER_SECOND);

      // Look for updates from the receiver.
      receiver.on('message', (data, broadcast) => {
        // Certain messages may contain a list of running apps.
        // Look for those to indicate a change in what's running.
        let appLaunched = false;
        let homeLaunched = false;
        if (data.type == 'RECEIVER_STATUS') {
          const applications = data.status.applications || [];
          const appIds = applications.map((app) => app.appId);
          appLaunched = appIds.includes(request.appId);
          // On traditional Cast devices, there's a home screen app to run.
          // On the new Google Pixel tablet (2023), the list becomes empty.
          homeLaunched = appIds.includes(HOME_SCREEN_APP_ID) ||
                         appIds.length == 0;
        }

        if (request.type == 'LAUNCH' && appLaunched) {
          // The request was fulfilled.
          log.info('Cast successful.');
          clearTimeout(connectionTimer);
          client.close();
          resolve();
        } else if (request.type == 'STOP' && homeLaunched) {
          // The home screen is showing.
          log.info('Return to home screen successful.');
          clearTimeout(connectionTimer);
          client.close();
          resolve();
        } else if (data.type == 'LAUNCH_ERROR') {
          const message = 'Failed to launch receiver!  Reason: ' + data.reason;
          reject(new Error(message));
        } else if (data.type == 'RECEIVER_STATUS' && data.status.volume) {
          // Ignore updates on audio volume.  These occur frequently, are not
          // useful, and should not be logged below.
        } else if (data.type == 'LAUNCH_STATUS' &&
                   data.status == 'USER_PENDING_AUTHORIZATION') {
          log.info('Waiting for user authorization to run the receiver...');
        } else if (data.type == 'LAUNCH_STATUS' &&
                   data.status == 'USER_ALLOWED') {
          // This occurs when the user has chosen "always allow" for a previous
          // launch.  The launch is happening, and there is no need to log this
          // status.
        } else {
          // TODO: are there other common errors we need to check for?
          log.debug('Unrecognized data from castv2:', data);
        }
      });  // receiver.on
    });  // client.connect
  });  // new Promise
}

/**
 * Add Chromecast-specific arguments to the application's argument parser (from
 * the "yargs" module).
 *
 * @param {Yargs} yargs The argument parser object from "yargs".
 */
function addChromecastArgs(yargs) {
  yargs
      .option('hostname', {
        description:
            'The Chromecast hostname or IP address, with optional port ' +
            'number (default port number is 8009)',
        type: 'string',
        demandOption: true,
      })
      .option('receiver-app-id', {
        description: 'The Chromecast receiver app ID',
        type: 'string',
        default: '29993EC8',
      })
      .option('redirect', {
        description:
            'Use a redirect strategy instead of an iframe;' +
            ' requires the Cast SDK to be loaded at the destination URL',
        type: 'boolean',
        default: false,
      })
      .option('connection-timeout-seconds', {
        description: 'A timeout for the Chromecast connection',
        type: 'number',
        default: 30,
      });
}

module.exports = {
  Mode,
  cast,
  addChromecastArgs,
};
