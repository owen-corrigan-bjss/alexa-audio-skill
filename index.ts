/* *
 * This sample demonstrates handling intents for an Alexa skill implementing the AudioPlayer interface using the Alexa Skills Kit SDK (v2).
 * This sample works using the default DynamoDB table associated with an Alexa-hosted skill - you will need to use this with a hosted skill,
 * or you use your own DynamoDB table in the request and response interceptors.
 * Please visit https://github.com/alexa-samples for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
import {
    ErrorHandler,
    HandlerInput,
    RequestHandler,
    SkillBuilders,
  } from 'ask-sdk-core';
  import {
    Response,
    SessionEndedRequest,
  } from 'ask-sdk-model';
const AWS = require('aws-sdk');

const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

const LaunchRequestHandler: RequestHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'LaunchRequest';
    },
    handle(handlerInput: HandlerInput): Response {
        const speakOutput = 'Welcome, to this audio newsletter you can say "play audio" to start listening. What would you like to do?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const PlayAudioIntentHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest'
            && (request.intent.name === 'PlayAudioIntent'
                || request.intent.name === 'AMAZON.ResumeIntent');
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
        const playbackInfo = await getPlaybackInfo(handlerInput);

        const speakOutput = 'Playing the audio stream.';
        const playBehavior = 'REPLACE_ALL';
        const podcastUrl = 'https://soundcloud.com/owenchapman-1/3-x-2';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .addAudioPlayerPlayDirective(
                playBehavior,
                podcastUrl,
                playbackInfo.token,
                playbackInfo.offsetInMilliseconds
                )
            .getResponse();
    }
};

const PauseAudioIntentHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean  {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest'
            && request.intent.name === 'AMAZON.PauseIntent';
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
        return handlerInput.responseBuilder
            .addAudioPlayerStopDirective()
            .getResponse();
    }
};

const UnsupportedAudioIntentHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean  {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest'
            && (
                request.intent.name === 'AMAZON.LoopOffIntent'
                    || request.intent.name === 'AMAZON.LoopOnIntent'
                    || request.intent.name === 'AMAZON.NextIntent'
                    || request.intent.name === 'AMAZON.PreviousIntent'
                    || request.intent.name === 'AMAZON.RepeatIntent'
                    || request.intent.name === 'AMAZON.ShuffleOffIntent'
                    || request.intent.name === 'AMAZON.ShuffleOnIntent'
                    || request.intent.name === 'AMAZON.StartOverIntent'
                );
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
        const speakOutput = 'Sorry, I can\'t support that yet.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean  {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest'
            && request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput: HandlerInput): Response {
        const speakOutput = 'You can say "play audio" to start playing music! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean  {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest'
            && (request.intent.name === 'AMAZON.CancelIntent'
                || request.intent.name === 'AMAZON.StopIntent');
    },
    handle(handlerInput: HandlerInput): Response {
        const speakOutput = 'Goodbye!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const AudioPlayerEventHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean  {
    const request = handlerInput.requestEnvelope.request;
    return request.type.startsWith('AudioPlayer.');
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request;
    const playbackInfo = await getPlaybackInfo(handlerInput);
    
    const audioPlayerEventName = handlerInput.requestEnvelope.request.type.split('.')[1];
    console.log(`AudioPlayer event encountered: ${handlerInput.requestEnvelope.request.type}`);
    let returnResponseFlag = false;
    switch (audioPlayerEventName) {
      case 'PlaybackStarted':
        playbackInfo.token = (request as any).token;
        playbackInfo.inPlaybackSession = true;
        playbackInfo.hasPreviousPlaybackSession = true;
        returnResponseFlag = true;
        break;
      case 'PlaybackFinished':
        playbackInfo.inPlaybackSession = false;
        playbackInfo.hasPreviousPlaybackSession = false;
        playbackInfo.nextStreamEnqueued = false;
        returnResponseFlag = true;
        break;
      case 'PlaybackStopped':
        playbackInfo.token = (request as any).token;
        playbackInfo.inPlaybackSession = true;
        playbackInfo.offsetInMilliseconds = (request as any).offsetInMilliseconds;
        break;
      case 'PlaybackNearlyFinished':
        break;
      case 'PlaybackFailed':
        playbackInfo.inPlaybackSession = false;
        console.log('Playback Failed : %j', (request as any).error);
        break;
      default:
        break;
    }
    setPlaybackInfo(handlerInput, playbackInfo);
    return handlerInput.responseBuilder.getResponse();
  },
};

const PlaybackControllerHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean  {
    const request = handlerInput.requestEnvelope.request;
    return request.type.startsWith('PlaybackController.');
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const playbackInfo = await getPlaybackInfo(handlerInput);
    const playBehavior = 'REPLACE_ALL';
    const podcastUrl = 'https://audio1.maxi80.com';
    const playbackControllerEventName = handlerInput.requestEnvelope.request.type.split('.')[1];
    let response;
    switch (playbackControllerEventName) {
      case 'PlayCommandIssued':
        response = handlerInput.responseBuilder
            .addAudioPlayerPlayDirective(
                playBehavior,
                podcastUrl,
                playbackInfo.token,
                playbackInfo.offsetInMilliseconds
                )
            .getResponse();
        break;
      case 'PauseCommandIssued':
        response = handlerInput.responseBuilder
            .addAudioPlayerStopDirective()
            .getResponse();
        break;
      default:
        break;
    }
    setPlaybackInfo(handlerInput, playbackInfo);

    console.log(`PlayCommandIssued event encountered: ${handlerInput.requestEnvelope.request.type}`);
    return response;
  },
};
// const SystemExceptionHandler = {
//   canHandle(handlerInput: HandlerInput): boolean  {
//     return handlerInput.requestEnvelope.request.type === 'System.ExceptionEncountered';
//   },
//   handle(handlerInput: HandlerInput): Response {
//     console.log(`System exception encountered: ${JSON.stringify(handlerInput.requestEnvelope.request)}`);
//     return `System exception encountered: ${JSON.stringify(handlerInput.requestEnvelope.request)}`
// },
// };

const FallbackIntentHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean  {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest'
            && request.intent.name === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput: HandlerInput): Response {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean  {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'SessionEndedRequest';
    },
    handle(handlerInput: HandlerInput): Response {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

const IntentReflectorHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest';
    },
    handle(handlerInput: HandlerInput): Response {
        const request = handlerInput.requestEnvelope.request;
        const intentName = (request as any).intent.name
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

const ErrorHandler: ErrorHandler = {
    canHandle(): boolean {
        return true;
    },
    handle(handlerInput: HandlerInput, error: Error): Response {
        const speakOutput = 'Sorry, I had trouble doing what you asked. Please try again.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/* HELPER FUNCTIONS */

async function getPlaybackInfo(handlerInput) {
  const attributes = await handlerInput.attributesManager.getPersistentAttributes();
  return attributes.playbackInfo;
}

async function setPlaybackInfo(handlerInput, playbackInfoObject) {
  await handlerInput.attributesManager.setPersistentAttributes({
      playbackInfo: playbackInfoObject
      });
}

// Request and response interceptors using the DynamoDB table associated with Alexa-hosted skills

const LoadPersistentAttributesRequestInterceptor = {
  async process(handlerInput) {
    const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();

    /**
     * Check if user is invoking the skill the first time and initialize preset values
        playbackInfo: {
              offsetInMilliseconds - this is used to set the offset of the audio file 
                        to save the position between sessions
              token - save an audio token for this play session
              inPlaybackSession - used to record the playback state of the session
              hasPreviousPlaybackSession - used to help confirm previous playback state
            }
    */
    if (Object.keys(persistentAttributes).length === 0) {
      handlerInput.attributesManager.setPersistentAttributes({
        playbackInfo: {
          offsetInMilliseconds: 0,
          token: 'sample-audio-token',
          inPlaybackSession: false,
          hasPreviousPlaybackSession: false,
        },
      });
    }
  },
};

const SavePersistentAttributesResponseInterceptor = {
  async process(handlerInput) {
    await handlerInput.attributesManager.savePersistentAttributes();
  },
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        PlayAudioIntentHandler,
        PauseAudioIntentHandler,
        UnsupportedAudioIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        AudioPlayerEventHandler,
        PlaybackControllerHandler,
        // SystemExceptionHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .addRequestInterceptors(LoadPersistentAttributesRequestInterceptor)
    .addResponseInterceptors(SavePersistentAttributesResponseInterceptor)
    .withCustomUserAgent('sample/audioplayer-nodejs/v2.0')
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION})
        })
    )
    .lambda();