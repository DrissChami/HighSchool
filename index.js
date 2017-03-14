var http = require('http'),
    express = require('express'),
    bodyParser = require('body-parser'),
    pg = require('pg'),
    fs = require('fs'),
    bdd,

    app = express();


app.use(express.static(__dirname+'/public'));
app.use(bodyParser.urlencoded({ extended: false }));

var connect = (process.env.DATABASE_URL) ? process.env.DATABASE_URL : "postgres://etienne:@localhost/";

app.set('view engine', 'ejs');

app.use(bodyParser.json());

app.get('/', function(req, res){
    res.render('index');
});

app.post('/eleve', function(req, res){
    res.redirect('/eleve/' + req.body.id);
});

app.get('/eleves', function(req, res){

    bdd.query('SELECT * FROM eleve', function(err, result){
        if(err){
            return console.error('Erreur avec la table eleve', err);
        }
        if(result.rows){
            res.render('eleves', {
                eleves: result.rows
            });
        }
    });
});


app.post('/eleve/add', function(req, res){

    console.log(req.body);
    
    bdd.query("INSERT INTO eleve (nom, prenom, date_naissance, ville_naissance, pays_naissance, etablissement_precedent, photo, sexe, date_inscription, convocation, bulletin) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [req.body.nom, 
         req.body.prenom, 
         req.body.date_naissance, 
         req.body.ville_naissance, 
         req.body.pays_naissance, 
         req.body.etablissement_precedent, 
         null, 
         true, 
         req.body.date_inscription, 
         null,
         null]    
    );
    
    res.redirect('/eleves');
    
});

app.get('/adm', function(req, res){
    res.render('admin');
});

app.get('/eleve/add', function(req, res){
    res.render('ajoutEleve');
});

app.get('/eleve/:id', function(req, res){
    bdd.query('SELECT * FROM eleve WHERE matricule = $1', [req.params.id], function(err, result){
        if(err) return console.error("Erreur dans l'accès aux données d'un étudiant");

        res.render('eleveProfil', {
            eleve: (result.rows[0]) ? result.rows[0] : null
        });
    });
});

app.put('/eleve/:id', function(req, res){          // Changements réalisés par un élève (il ne peut modifier que sa photo)

    bdd.query("UPDATE eleve SET photo = $1 WHERE matricule = $2",
        [
            req.body.photo, 
            req.params.id
        ]    
    );
    
    res.redirect('/eleve/' + req.params.id);
});


// ############# SERVER START ########

app.listen(process.env.PORT || 5000, function(){
    console.log('Started on port ' + (process.env.PORT || '3000'));
    pg.connect(connect, function(err, client, done){
        if(err){
            return console.log("Erreur de connexion a la BDD");
        }
        bdd = client;
    });
});