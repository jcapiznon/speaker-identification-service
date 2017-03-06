'use strict'

const reekoh = require('reekoh')
const _plugin = new reekoh.plugins.Service()

const request = require('request')
const isEmpty = require('lodash.isempty')
const isPlainObject = require('lodash.isplainobject')

_plugin.on('data', (data) => {
  if (!isPlainObject(data)) {
    return _plugin.logException(new Error(`Invalid data received. Must be a valid JSON Object. Data: ${data}`))
  }

  if (isEmpty(data) || isEmpty(data.audio)) {
    return _plugin.logException(new Error('Invalid data received. Data must have a base64 encoded audio field.'))
  }

  if (isEmpty(_plugin.config.profileIds) && (isEmpty(data.profileIds) || isEmpty(data.profileIds))) {
    return _plugin.logException(new Error('No profile IDs specified. Could not compare speaker to existing pool of speaker profiles.'))
  }

  request.post({
    url: _plugin.config.speakerIdApiEndPoint,
    qs: {
      identificationProfileIds: _plugin.config.profileIds
    },
    headers: {
      'Content-Type': 'application/octet-stream',
      'Ocp-Apim-Subscription-Key': _plugin.config.apiKey
    },
    body: new Buffer(data.audio, 'base64')
  }, (error, response) => {
    if (error) {
      console.error(error)
      _plugin.logException(error)
    } else if (response.statusCode !== 202) {
      console.log(error)
      _plugin.logException(new Error(`HTTP ${response.statusCode}: Speaker Identification Error`))
    } else {
      let speakerProfile = {}
      let opsLoc = response.headers['operation-location']

      let interval = setInterval(() => {
        if (!isEmpty(speakerProfile)) return clearInterval(interval)

        request.get({
          url: opsLoc,
          headers: {
            'Ocp-Apim-Subscription-Key': _plugin.config.apiKey
          }
        }, (opsError, opsResponse, opsBody) => {
          if (opsError) {
            console.error(opsError)
            _plugin.logException(opsError)
          } else if (opsResponse.statusCode !== 200) {
            let errorMessage = ''

            try {
              errorMessage = JSON.parse(opsBody).message
            } catch (ex) {
              console.log(ex)
            }
            _plugin.logException(new Error(`HTTP ${opsResponse.statusCode}: ${errorMessage}`))
          } else {
            try {
              let bodyObj = JSON.parse(opsBody)
              if (bodyObj.status === 'succeeded') {
                speakerProfile = {
                  speakerRecognitionResult: bodyObj.processingResult
                }

                _plugin.pipe(data, JSON.stringify(speakerProfile))
                    .then(() => {
                      _plugin.log(JSON.stringify({
                        title: ' Speaker has been Identified',
                        result: speakerProfile
                      }))
                      clearInterval(interval)
                    })
                    .catch((error) => {
                      _plugin.logException(error)
                    })
              }
            } catch (ex) {
              console.error(ex)
              _plugin.logException(ex)
            }
          }
        })
      }, 5000)
    }
  })
})

_plugin.once('ready', () => {
  _plugin.log('Speaker Identification Service has been initialized.')
  _plugin.emit('init')
})

module.exports = _plugin
