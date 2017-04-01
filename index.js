// ###### VAR INITIALIZATION ######

var http = require('http'),
    express = require('express'),
    cookieParser = require('cookie-parser'),
    multer = require('multer'),
    upload = multer({
        dest: 'uploads/'
    }),
    bodyParser = require('body-parser'),
    pg = require('pg'),
    fs = require('fs'),
    nl2br = require('nl2br'),
    jwt = require('jsonwebtoken'),
    bdd,
    app = express();

var connect = (process.env.DATABASE_URL) ? process.env.DATABASE_URL : "postgres://etienne:@localhost/";


// ###### APP CONFIGURATION ######

app.set('superSecret', 'M0t_2_passe_KI_tue');
app.set('view engine', 'ejs');

app.use(cookieParser());
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());


// ###### HELPER FUNCTIONS ######

function moveTo(source, dest, callback) {
    fs.rename(source, dest, function (err) {
        if (err) throw err;

        fs.unlink(source, callback);
    });
}


// ###### SERVER START ######

app.listen(process.env.PORT || 5000, function () {

    pg.connect(connect, function (err, client, done) {
        if (err) {
            console.log("ERREUR de connexion a la BDD");
            console.log("Veuillez démarrer le serveur Postgres");
            process.exit();
        }
        console.log("A l'écoute sur le port " + (process.env.PORT || '5000'));
        bdd = client;
    });
});


// ###### ROUTE GENERALE & AUTHENTIFICATION ######

var root = express.Router();

root.get('/', function (req, res) {
    if (req.cookies.remember) {
        console.log("COOKIE AVAILABLE !");
    } else {
        console.log("No cookie.");
    }
    res.render('index');
});

root.post('/login', function (req, res) {

    console.log(req.body.identifiant + ' ' + req.body.password + '#');

    if (req.body.identifiant && req.body.password) {
        bdd.query('SELECT * FROM password WHERE identifiant = $1 AND mot_de_passe = $2', [req.body.identifiant, req.body.password], function (err, result) {
            if (err) return console.error("Erreur dans la procédure de login");

            if (result.rows[0]) {

                console.log(result.rows[0]);

                var user = {
                    identifiant: req.body.identifiant,
                    administrateur: result.rows[0].administrateur,
                    professeur: result.rows[0].professeur
                }

                var token = jwt.sign(user, app.get('superSecret'));

                // PROCEED TO ELEVE ADMIN                
                res.json({
                    success: true,
                    token: token
                });

            } else {
                res.json({
                    success: false,
                    message: "Erreur dans le mot de passe / identifiant"
                });
            }
        });
    } else  {
        res.json({
            success: false,
            message: "ID et/ou password non envoyé."
        });
    }

});


// ###### ROUTES ######

app.post('/eleve', function (req, res) {
    res.redirect('/eleve/' + req.body.id);
})

app.get('/eleves', function (req, res) {

    bdd.query('SELECT * FROM eleve', function (err, result) {
        if (err) {
            return console.error('Erreur avec la table eleve', err);
        }
        if (result.rows) {
            res.render('eleves', {
                eleves: result.rows
            });
        }
    });
});


var eleveUpload = upload.fields([{
    name: 'photo',
    maxCount: 1
}, {
    name: 'convocation',
    maxCount: 1
}, {
    name: 'bulletin',
    maxCount: 1
}]);

app.post('/eleve/add', eleveUpload, function (req, res) {

    bdd.query("INSERT INTO eleve (nom, prenom, date_naissance, ville_naissance, pays_naissance, etablissement_precedent, sexe, date_inscription, nom_medecin, prenom_medecin, telephone_medecin, remarques_medicales) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)", [req.body.nom,
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
        ]);

    bdd.query("SELECT MAX(matricule) FROM eleve", function (err, result) {
        if (err) return console.error("Erreur dans l'obtention du dernier ID d'élève");

        var ID = result.rows[0].max;

        // ### Upload photo, convocation, bulletin

        if (req.files['photo'] && req.files['photo'][0]) {

            var tmp_path = req.files['photo'][0].path;
            var target_path = './public/photos/' + ID + '.jpg'; // Accepte jpg, jpeg, png

            moveTo(tmp_path, target_path, function () {});

        }

        if (req.files['convocation'] && req.files['convocation'][0]) {

            var convoc = req.files['convocation'][0];
            var extension = '.txt';

            var tmp_path = convoc.path;
            var target_path = './public/document/convocation/' + ID + extension;
            moveTo(tmp_path, target_path, function () {});
        }

        if (req.files['bulletin'] && req.files['bulletin'][0]) {

            var bulletin = req.files['bulletin'][0];
            var extension = '.pdf';

            var tmp_path = bulletin.path;
            var target_path = './public/document/bulletin/' + ID + extension;
            moveTo(tmp_path, target_path, function () {});
        }

        res.redirect('/eleve/' + ID);

    });

});

app.get('/adm', function (req, res) {
    res.render('admin');
});

app.get('/eleve/add', function (req, res) {
    res.render('ajoutEleve');
});

app.get('/eleve/:id', function (req, res) {
    res.redirect('/eleve/' + req.params.id + '/administration');
});

app.get('/eleve/:id/administration', function (req, res) {

    var eleve = {};
    eleve.matricule = req.params.id;

    bdd.query('SELECT matricule, prenom, nom, photo, sexe, date_naissance, ville_naissance, pays_naissance, etablissement_precedent, date_inscription FROM eleve WHERE matricule = $1', [eleve.matricule], function (err, result) {
        if (err) return console.error("Erreur dans l'accès aux données admin de l'élève " + eleve.matricule);

        if (result.rows[0] == null) {
            res.render('eleve/administration', {
                eleve: null
            });
        } else {
            eleve = result.rows[0];

            bdd.query('SELECT * FROM contact WHERE matricule_eleve = $1 AND nom_contact IS NULL', [eleve.matricule], function (err, result) {
                if (err) return console.error("Erreur dans l'accès à l'adresse de l'élève " + eleve.matricule);

                eleve.adresse = null;

                if (result.rows[0]) {
                    eleve.adresse = result.rows[0];
                }

                bdd.query('SELECT niveau, nom FROM classe WHERE id_classe IN (SELECT id_classe FROM est_dans_classe WHERE matricule = $1) AND annee = (SELECT MAX(annee) FROM (SELECT annee FROM classe WHERE id_classe IN (SELECT id_classe FROM est_dans_classe WHERE matricule = $1)) AS max)',   [eleve.matricule], function (err, result) {
                    if (err) return console.error("Erreir dans l'obtention de la classe de l'élève " + eleve.matricule);

                    eleve.classe = null;
                    if (result.rows[0])
                        eleve.classe = result.rows[0];

                    res.render('eleve/administration', {
                        eleve: eleve
                    });
                });
            });
        }
    });
});

app.get('/eleve/:id/sante', function (req, res) {

    var eleve = {};
    matricule = req.params.id;

    bdd.query('SELECT nom, prenom, nom_medecin, prenom_medecin, telephone_medecin, remarques_medicales FROM eleve WHERE matricule = $1', [matricule], function (err, result) {
        if (err) return console.error("Erreur dans l'accès aux données médicales de l'élève " + matricule);

        if (result.rows[0] == null) {
            res.render('eleve/sante', {
                eleve: null
            });
        } else {
            eleve = result.rows[0];
            eleve.matricule = matricule;

            bdd.query('SELECT nom_vaccin FROM vaccin WHERE id_vaccin IN (SELECT id_vaccin FROM est_vaccine WHERE matricule = $1)', [matricule], function (err, result) {
                if (err) return console.error("Erreur dans l'obtention des vaccins de l'élève " + matricule);

                eleve.vaccins = result.rows;

                bdd.query('SELECT nom_allergie FROM allergie WHERE id_allergie IN (SELECT id_allergie FROM est_allergique WHERE matricule = $1)', [matricule], function (err, result) {
                    if (err) return console.error("Erreur dans l'obtention des allergies de l'élève " + matricule);

                    eleve.allergies = result.rows;

                    res.render('eleve/sante', {
                        eleve: eleve
                    });
                });
            });
        }
    });
});

app.get('/eleve/:id/scolarite', function (req, res) {

    var eleve = {};
    matricule = req.params.id;

    bdd.query('SELECT nom, prenom, bulletin, convocation FROM eleve WHERE matricule = $1', [matricule], function (err, result) {
        if (err) return console.error("Erreur dans l'accès aux données de l'élève " + matricule);

        if (result.rows[0] == null) {
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

app.get('/eleve/:id/contacts', function (req, res) {

    var eleve = {};
    matricule = req.params.id;

    bdd.query('SELECT nom, prenom FROM eleve WHERE matricule = $1', [matricule], function (err, result) {
        if (err) return console.error("Erreur dans l'accès aux données de l'élève " + matricule);

        if (result.rows[0] == null) {
            res.render('eleve/contacts', {
                eleve: null
            });
        } else {
            eleve = result.rows[0];
            eleve.matricule = matricule;

            bdd.query('SELECT * FROM contact WHERE matricule_eleve = $1 AND nom_contact IS NOT NULL', [matricule], function (err, result) {
                if (err) return console.error("Erreur dans l'accès aux contacts de l'élève " + matricule);

                eleve.contacts = result.rows;
                for (var i = 0; i < eleve.contacts.length; i++) {
                    eleve.contacts[i].matricule = i;
                }

                res.render('eleve/contacts', {
                    eleve: eleve
                });
            });
        }
    });
});

app.get('/classe', function (req, res) {

    bdd.query('SELECT * FROM classe', function (err, result) {
        if (err) return console.error("Erreur dans l'accès à la liste des classes");

        res.render('classes', {
            classes: result.rows
        });
    });

});

app.get('/classe/:id_classe', function (req, res) {

    bdd.query('SELECT * FROM est_dans_classe WHERE id_classe = $1', [req.params.id_classe], function (err, result) {
        if (err) return console.error("Erreur dans l'accès à la liste des élèves d'une classe");

        res.render('classeCompo', {
            classe: result.rows
        });
    });

});


app.post('/eleve/:id/newphoto', upload.single('photo'), function (req, res) {

    // get the temporary location of the file
    var tmp_path = req.file.path;

    // set where the file should actually exists
    var target_path = './public/photos/' + req.params.id + '.jpg';

    bdd.query("UPDATE eleve SET photo = true WHERE matricule = $1", [req.params.id]);

    moveTo(tmp_path, target_path, function () {
        res.redirect('/eleve/' + req.params.id);
    });

});

app.post('/eleve/:id/newadresse', function (req, res) {
    // CHECK SAFETY

    bdd.query("UPDATE contact SET adresse = $1, cp = $2, ville=$3 WHERE matricule_eleve = $4 AND nom_contact IS NULL;", [req.body.adresse, req.body.cp, req.body.ville, req.params.id]);

    res.redirect('/eleve/' + req.params.id);
});

app.post('/eleve/:id/brandnewadresse', function (req, res) {
    // CHECK SAFETY

    bdd.query("INSERT INTO contact (adresse, cp, ville, matricule_eleve) VALUES ($1, $2, $3, $4)", [req.body.adresse, req.body.cp, req.body.ville, req.params.id]);

    res.redirect('/eleve/' + req.params.id + '/administration');
});

app.post('/eleve/:id/brandnewcontact', function (req, res) {
    // CHECK SAFETY

    bdd.query("INSERT INTO contact (telephone_domicile, telephone_mobile, email, matricule_eleve) VALUES ($1, $2, $3, $4)", [req.body.telephone_domicile, req.body.telephone_mobile, req.body.email, req.params.id]);

    res.redirect('/eleve/' + req.params.id + '/administration');
});

app.post('/eleve/:id/newcontact', function (req, res) {
    // CHECK SAFETY

    bdd.query("UPDATE contact SET telephone_domicile = $1, telephone_mobile = $2, email = $3 WHERE matricule_eleve = $4 AND nom_contact IS NULL", [req.body.telephone_domicile, req.body.telephone_mobile, req.body.email, req.params.id]);

    res.redirect('/eleve/' + req.params.id);
});

app.post('/eleve/:id/newmedecin', function (req, res) {
    // CHECK SAFETY

    bdd.query("UPDATE eleve SET telephone_medecin = $1, nom_medecin = $2, prenom_medecin = $3 WHERE matricule = $4", [req.body.telephone_medecin, req.body.nom_medecin, req.body.prenom_medecin, req.params.id]);

    res.redirect('/eleve/' + req.params.id + '/sante');
});

app.post('/eleve/:id/rem_med', function (req, res) {
    // CHECK SAFETY

    var escaped_text = (nl2br(req.body.rem_med));

    bdd.query("UPDATE eleve SET remarques_medicales = $1 WHERE matricule = $2", [escaped_text, req.params.id]);

    res.redirect('/eleve/' + req.params.id + '/sante');
});

/*
app.post('/authenticate', function(req, res) {

    // find the user
    
    var user = {
        identifiant: req.body.identifiant,
        password: req.body.password,
        administrateur: false,
        professeur: false
    }
    
    
    // PAS DE USER
    // MAUVAIS PASSWORD
    // GOOD
    
    if(user.identifiant != '2' || user.password != ' '){
        res.json({
            success: false,
            message: "C'est pas bon John."
        });
    } else {

        var token = jwt.sign(user, app.get('superSecret'));

        res.json({
            success: true,
            message: 'Enjoy your token!',
            token: token
        });
    }
});

*/








// ##################################################


var apiRoutes = express.Router();

// Unprotected routes

apiRoutes.get('/', function (req, res) {
    res.json({
        message: 'Welcome to the coolest API on earth!'
    });
});


// route middleware to verify a token
apiRoutes.use(function (req, res, next) {

    // check header or url parameters or post parameters for token
    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    // decode token
    if (token) {

        // verifies secret and checks exp
        jwt.verify(token, app.get('superSecret'), function (err, decoded) {
            if (err) {
                return res.json({
                    success: false,
                    message: 'Failed to authenticate token.'
                });
            } else {
                // if everything is good, save to request for use in other routes
                req.decoded = decoded;
                next();
            }
        });

    } else {

        // if there is no token
        // return an error
        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        });

    }
});

// Protected routes

// route to return all users (GET http://localhost:8080/api/users)
apiRoutes.get('/users', function (req, res) {
    res.json({
        message: 'Badasss!',
        token: req.decoded
    });
});


// apply the routes to our application with the prefix /api
app.use('/token', apiRoutes);

app.use('/', root);
