var http = require('http'),
    express = require('express'),
    multer = require('multer'),
    upload = multer({ dest: 'uploads/' }),
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

app.get('/try/administration', function(req, res){
    res.render('eleve/administration');
});

app.get('/try/scolarite', function(req, res){
    res.render('eleve/scolarite');
});

app.get('/try/sante', function(req, res){
    res.render('eleve/sante');
});

app.get('/try/contacts', function(req, res){
    res.render('eleve/contacts');
});

app.post('/eleve', function(req, res){
    res.redirect('/eleve/' + req.body.id);
})

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


var eleveUpload = upload.fields([{name: 'photo', maxCount: 1}, {name: 'convocation', maxCount: 1}, {name:'bulletin', maxCount: 1}]);
         
app.post('/eleve/add', eleveUpload, function(req, res){

    bdd.query("INSERT INTO eleve (nom, prenom, date_naissance, ville_naissance, pays_naissance, etablissement_precedent, sexe, date_inscription, nom_medecin, prenom_medecin, telephone_medecin, remarques_medicales) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [req.body.nom, 
         req.body.prenom, 
         req.body.date_naissance, 
         req.body.ville_naissance, 
         req.body.pays_naissance, 
         req.body.etablissement_precedent, 
         true,
         req.body.date_inscription, 
         req.body.nom_medecin,
         req.body.prenom_medecin,
         req.body.telephone_medecin,
         req.body.remarques_medicales
        ]    
    );

    bdd.query("SELECT MAX(matricule) FROM eleve", function(err, result){
        if(err) return console.error("Erreur dans l'obtention du dernier ID d'élève");
        
        var ID = result.rows[0].max;
        
        // ### Upload photo, convocation, bulletin

        if(req.files['photo'] && req.files['photo'][0]){
            
            var tmp_path = req.files['photo'][0].path;
            var target_path = './public/photos/' + ID + '.jpg'; // Accepte jpg, jpeg, png
            
            moveTo(tmp_path, target_path, function(){});

        }
        
        if(req.files['convocation'] && req.files['convocation'][0]){
            
            var convoc = req.files['convocation'][0];
            var extension = '.txt';
            
            var tmp_path = convoc.path;
            var target_path = './public/document/convocation/' + ID + extension;
            moveTo(tmp_path, target_path, function(){});
        }
        
        if(req.files['bulletin'] && req.files['bulletin'][0]){
                        
            var bulletin = req.files['bulletin'][0];
            var extension = '.pdf';
            
            var tmp_path = bulletin.path;
            var target_path = './public/document/bulletin/' + ID + extension;
            moveTo(tmp_path, target_path, function(){});
        }
        
        res.redirect('/eleve/' + ID);
        
    });
    
});

app.get('/adm', function(req, res){
    res.render('admin');
});

app.get('/mymy', function(req, res){
   console.log('Bonjour Mymy !'); 
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
    res.redirect('/eleve/' + req.params.id + '/administration');
});

app.get('/eleve/:id/administration', function(req, res){

    var eleve = {};
    eleve.matricule = req.params.id;
    
    bdd.query('SELECT matricule, prenom, nom, photo, sexe, date_naissance, ville_naissance, pays_naissance, etablissement_precedent, date_inscription FROM eleve WHERE matricule = $1', [eleve.matricule], function(err, result){
        if(err) return console.error("Erreur dans l'accès aux données admin de l'élève " + eleve.matricule);
        
        if(result.rows[0] == null){
            res.render('eleve/administration', {
                eleve: null
            });
        } else {
            eleve = result.rows[0];
            
            bdd.query('SELECT * FROM contact WHERE matricule_eleve = $1 AND nom_contact IS NULL', [eleve.matricule], function(err, result){
                if(err) return console.error("Erreur dans l'accès à l'adresse de l'élève " + eleve.matricule);
                
                eleve.adresse = null;

                if(result.rows[0]){
                    eleve.adresse = result.rows[0];
                }
                
                bdd.query('SELECT niveau, nom FROM classe WHERE id_classe IN (SELECT id_classe FROM est_dans_classe WHERE matricule = $1) AND annee = (SELECT MAX(annee) FROM (SELECT annee FROM classe WHERE id_classe IN (SELECT id_classe FROM est_dans_classe WHERE matricule = $1)) AS max)', [eleve.matricule], function(err, result){
                    if(err) return console.error("Erreir dans l'obtention de la classe de l'élève " + eleve.matricule);
                    
                    eleve.classe = null;
                    if(result.rows[0])
                        eleve.classe = result.rows[0];

                    res.render('eleve/administration', {
                        eleve: eleve
                    });
                });
            });
        }
    });
});

app.get('/eleve/:id/sante', function(req, res){

    var eleve = {};
    matricule = req.params.id;
    
    bdd.query('SELECT nom, prenom, nom_medecin, prenom_medecin, telephone_medecin, remarques_medicales FROM eleve WHERE matricule = $1', [matricule], function(err, result){
        if(err) return console.error("Erreur dans l'accès aux données médicales de l'élève " + matricule);
        
        if(result.rows[0] == null){
            res.render('eleve/sante', {
                eleve: null
            });
        } else {
            eleve = result.rows[0];
            eleve.matricule = matricule;
            
            bdd.query('SELECT nom_vaccin FROM vaccin WHERE id_vaccin IN (SELECT id_vaccin FROM est_vaccine WHERE matricule = $1)', [matricule], function(err, result){
                if(err) return console.error("Erreur dans l'obtention des vaccins de l'élève " + matricule);

                eleve.vaccins = result.rows;

                bdd.query('SELECT nom_allergie FROM allergie WHERE id_allergie IN (SELECT id_allergie FROM est_allergique WHERE matricule = $1)', [matricule], function(err, result){
                    if(err) return console.error("Erreur dans l'obtention des allergies de l'élève " + matricule);

                    eleve.allergies = result.rows;
                    
                    res.render('eleve/sante', {
                        eleve: eleve
                    });
                });
            });
        }
    });
});

app.get('/eleve/:id/scolarite', function(req, res){

    var eleve = {};
    matricule = req.params.id;
    
    bdd.query('SELECT nom, prenom, bulletin, convocation FROM eleve WHERE matricule = $1', [matricule], function(err, result){
        if(err) return console.error("Erreur dans l'accès aux données de l'élève " + matricule);
        
        if(result.rows[0] == null){
            res.render('eleve/scolarite', {
                eleve: null
            });
        } else {
            eleve = result.rows[0];
            eleve.matricule = matricule;

            res.render('eleve/scolarite', {
                eleve: eleve
            });
        }
    });
});

app.get('/eleve/:id/contacts', function(req, res){

    var eleve = {};
    matricule = req.params.id;
    
    bdd.query('SELECT nom, prenom FROM eleve WHERE matricule = $1', [matricule], function(err, result){
        if(err) return console.error("Erreur dans l'accès aux données de l'élève " + matricule);
        
        if(result.rows[0] == null){
            res.render('eleve/contacts', {
                eleve: null
            });
        } else {
            eleve = result.rows[0];
            eleve.matricule = matricule;
            
            bdd.query('SELECT * FROM contact WHERE matricule_eleve = $1 AND nom_contact IS NOT NULL', [matricule], function(err, result){
                if(err) return console.error("Erreur dans l'accès aux contacts de l'élève "+ matricule);
                
                eleve.contacts = result.rows;
                for(var i = 0; i < eleve.contacts.length; i++){
                    eleve.contacts[i].matricule = i;
                }
                
                res.render('eleve/contacts', {
                    eleve: eleve
                });
            });
        }
    });
});


/*

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

            bdd.query('SELECT * FROM contact WHERE matricule_eleve = $1', [matricule], function(err, result){
                if(err) return console.error("Erreur dans l'accès aux contacts de l'élève " + matricule);

                var contacts = result.rows;
                
                bdd.query('SELECT niveau, nom FROM classe WHERE id_classe IN (SELECT id_classe FROM est_dans_classe WHERE matricule = $1) AND annee = (SELECT MAX(annee) FROM (SELECT annee FROM classe WHERE id_classe IN (SELECT id_classe FROM est_dans_classe WHERE matricule = $1)) AS max)', [matricule], function(err, result){
                    if(err) return console.error("Erreur dans l'obtention de la classe de l'élève " + matricule);
                    
                    var classe = result.rows[0];
                    
                    bdd.query('SELECT nom_vaccin FROM vaccin WHERE id_vaccin IN (SELECT id_vaccin FROM est_vaccine WHERE matricule = $1)', [matricule], function(err, result){
                        if(err) return console.error("Erreur dans l'obtention des vaccins de l'élève " + matricule);
                        
                        var vaccins = result.rows;
                        
                        bdd.query('SELECT nom_allergie FROM allergie WHERE id_allergie IN (SELECT id_allergie FROM est_allergique WHERE matricule = $1)', [matricule], function(err, result){
                            if(err) return console.error("Erreur dans l'obtention des allergies de l'élève " + matricule);
                            
                            var allergies = result.rows;
                            
                            res.render('eleveProfil', {
                                eleve: eleve,
                                contacts: contacts,
                                classe: classe,
                                vaccins: vaccins,
                                allergies: allergies
                            });
                        });
                        
                    });
                    
                });
            });
        }
    });
});

*/

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
        "UPDATE eleve SET nom = $1, prenom = $2, date_naissance = $3, ville_naissance = $4, pays_naissance = $5, etablissement_precedent = $6, photo = $7, sexe = $8, date_inscription = $9, convocation = $10, bulletin = $11, nom_medecin = $12, prenom_medecin = $13, telephone_medecin = $14, remarques_medicales = $15 WHERE matricule = $16",
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
            req.body.nom_medecin,
            req.body.prenom_medecin,
            req.body.telephone_medecin,
            req.body.remarques_medicales,
            req.params.id
        ]
    );

    res.redirect('/eleve/' + req.params.id + '/modify');
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

app.get('/eleve/:id/newPhoto', function(req, res){
    res.render('newPhoto', {
        matricule: req.params.id
    });
});


app.post('/eleve/:id/newphoto', upload.single('photo'), function(req, res) {

    // get the temporary location of the file
    var tmp_path = req.file.path;
    
    // set where the file should actually exists
    var target_path = './public/photos/' + req.params.id + '.jpg';
    
    moveTo(tmp_path, target_path, function(){
        res.redirect('/eleve/' + req.params.id); 
    });
    
});


// ############# HELPER FUNCTIONS ########


function moveTo(source, dest, callback){
    fs.rename(source, dest, function(err){
        if (err) throw err;

        fs.unlink(source, callback);
    });
}

// ############# SERVER START ########

app.listen(process.env.PORT || 5000, function(){
    
    pg.connect(connect, function(err, client, done){
        if(err){
            console.log("ERREUR de connexion a la BDD");
            console.log("Veuillez démarrer le serveur Postgres");
            process.exit();
        }
        console.log("A l'écoute sur le port " + (process.env.PORT || '5000'));
        bdd = client;
    });
});