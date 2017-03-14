var http = require('http'),
    express = require('express'),
    bodyParser = require('body-parser'),
    pg = require('pg'),
    fs = require('fs'),
    bdd,

    app = express();


app.use(express.static(__dirname+'/public'));

var connect = (process.env.DATABASE_URL) ? process.env.DATABASE_URL : "postgres://etienne:@localhost/";

app.set('view engine', 'ejs');

app.use(bodyParser.json());

app.get('/', function(req, res){
    res.render('pages/index');
});

app.get('/eleves', function(req, res){

    bdd.query('SELECT * FROM eleve', function(err, result){
        if(err){
            return console.error('Erreur avec la table eleve', err);
        }
        if(result.rows){
            res.render('pages/eleves', {
                eleves: result.rows
            });
        }
    });
});


// ############# SERVER START ########

app.listen(process.env.PORT || 3000, function(){
    console.log('Started on port ' + (process.env.PORT || '3000'));
    pg.connect(connect, function(err, client, done){
        if(err){
            return console.log("Erreur de connexion a la BDD");
        }
        bdd = client;
    });
});