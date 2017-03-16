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

app.get('/eleve/modify', function(req, res){
    res.render('eleveModify');
});

app.post('/eleve/modify', function(req, res){
    res.redirect('/eleve/' + req.body.matricule + '/modify');
});

app.get('/eleve/:id', function(req, res){
    var matricule = req.params.id;
    bdd.query('SELECT * FROM eleve WHERE matricule = $1', [matricule], function(err, result){
        if(err) return console.error("Erreur dans l'accès aux données d'un étudiant");

        if(result.rows[0] == null){
            res.render('eleveProfil', {
                eleve: null
            });
        }else{ // On a un élève, donc on récupère ses contacts, santé, ...
            var eleve = result.rows[0];
            
            bdd.query('SELECT * FROM sante WHERE matricule = $1', [matricule], function(err, result){
                if(err) return console.error("Erreur dans l'accès aux informations de santé de l'élève " + matricule);
                
                var sante = result.rows[0];
                
                bdd.query('SELECT * FROM contact WHERE matricule_eleve = $1', [matricule], function(err, result){
                    if(err) return console.error("Erreur dans l'accès aux contacts de l'élève " + matricule);

                    var contacts = result.rows;

                    res.render('eleveProfil', {
                        eleve: eleve,
                        sante: sante,
                        contacts: contacts
                    });
                });
            });
        }
    });
});

app.get('/eleve/:id/modify', function(req, res){
    bdd.query('SELECT * FROM eleve WHERE matricule = $1', [req.params.id], function(err, result){
        if(err) return console.error("Erreur dans l'accès aux données d'un étudiant");

        res.render('eleveProfilModify', {
            eleve: (result.rows[0]) ? result.rows[0] : null
        });
    });
});

app.post('/eleve/:id/modify', function(req, res){

    bdd.query(
        "UPDATE eleve SET nom = $1, prenom = $2, date_naissance = $3, ville_naissance = $4, pays_naissance = $5, etablissement_precedent = $6, photo = $7, sexe = $8, date_inscription = $9, convocation = $10, bulletin = $11 WHERE matricule = $12",
        [
            req.body.nom, 
            req.body.prenom, 
            '1995-01-01', //req.body.date_naissance, 
            req.body.ville_naissance, 
            req.body.pays_naissance, 
            req.body.etablissement_precedent, 
            null,//            req.body.photo,
            req.body.sexe,
            '2014-04-04', //req.body.date_inscription, 
            req.body.convocation, 
            req.body.bulletin,
            req.params.id
        ]
    );

    res.redirect('/eleve/' + req.params.id + '/modify');
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


app.get('/classe', function(req, res){
   
    bdd.query('SELECT * FROM classe', function(err, result){
        if(err) return console.error("Erreur dans l'accès à la liste des classes");

        res.render('classes', {
            classes: result.rows
        });
    });
    
});

app.get('/classe/:id_classe', function(req, res){
   
    bdd.query('SELECT * FROM est_dans_classe WHERE id_classe = $1', [req.params.id_classe], function(err, result){
        if(err) return console.error("Erreur dans l'accès à la liste des élèves d'une classe");

        res.render('classeCompo', {
            classe: result.rows
        });
    });
    
});

// ############# SERVER START ########

app.listen(process.env.PORT || 5000, function(){
    console.log('Started on port ' + (process.env.PORT || '5000'));
    pg.connect(connect, function(err, client, done){
        if(err){
            return console.log("Erreur de connexion a la BDD");
        }
        bdd = client;
    });
});