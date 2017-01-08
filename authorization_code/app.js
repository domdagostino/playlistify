/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var cheerio = require('cheerio');
var scrape = require('scrape');
var http = require('http');
var SpotifyWebApi = require('spotify-web-api-node');
var spotifyApi = new SpotifyWebApi();


// This is client #2
var client_id = process.env.CLIENT_ID; // Your client id
var client_secret = process.env.CLIENT_SECRET; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri


/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});



app.get('/related_artists', function(req,res){
  var artist = req.query.artist; 
  var url = 'https://www.music-map.com/' + artist + '.html';
  var related = [];

  request(url, function (err, resp, body) {
      if (err) return console.error(err);
      $ = cheerio.load(body);

      $('#gnodMap a + a').each(function (div) {
        var name = $(this).text();
        related.push(name);
      });
      

      var related_ids = related.map(function (entry) {
        return spotifyApi.searchArtists(entry)
          .then(function(data) {
            if (data.body.artists.items[0] != null) {
              return data.body.artists.items[0].id;
            }
            else {
              return;
            }
          }, function(err) {
            console.error(err);
          }); 
      });

    var related_uris = [];
    Promise.all(related_ids)
      .then(function(arrayOfIds){
        return Promise.all(arrayOfIds.map(function(item) {
          if (item) {
             return spotifyApi.getArtistTopTracks(item, 'US')
              .then(function(data) {
                  for (i = 0; i <= 2; i++) {
                    var track = data.body.tracks[i];
                    if (track) { 
                      related_uris.push(track.uri);
                    }
                  }
                });
          } else {
            return Promise.resolve();
          }
        }));
      }).then(function() {
          console.log(related_uris);
          res.json(related_uris);
      }).catch(function(err) {
        // Will catch failure of first failed promise
        console.log("Failed:", err);
      });
  });
});


console.log('Listening on 8888');
app.listen(8888);
