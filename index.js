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
    res.render('index', {
        error: null
    });
});

root.get('/adm', function (req, res) {
    res.render('admin/admin_login_form');
});


root.post('/login', function (req, res) {

    if (req.body.identifiant && req.body.password) {

        bdd.query('SELECT * FROM password WHERE identifiant = $1 AND mot_de_passe = $2', [req.body.identifiant, req.body.password], function (err, result) {
            if (err) return console.error("Erreur dans la procédure de login");

            if (result.rows[0] && result.rows[0].identifiant) {
                var user = {
                    identifiant: result.rows[0].identifiant,
                    administrateur: result.rows[0].administrateur,
                    professeur: result.rows[0].professeur
                }

                var token = jwt.sign(user, app.get('superSecret'));

                res.cookie('logged', token);


                // REDIRECTION VERS LE BON ESPACE

                if (user.administrateur) {
                    res.redirect('/adm/' + user.identifiant);
                } else if (user.professeur) {
                    res.redirect('/prof/' + user.identifiant);
                } else {
                    res.redirect('/eleve/' + user.identifiant);
                }
            } else {
                res.render('index', {
                    error: true
                });
            }
        });
    } else  {

        res.render('index', {
            error: true
        });
    }
});


root.get('/logout', function (req, res) {
    res.clearCookie('logged');
    res.redirect('/');
});


// ###### CHECKING PROCEDURE ######

var checking = express.Router();

checking.use(function (req, res, next) {

    if (req.cookies.logged) {

        var token = req.cookies.logged;

        jwt.verify(token, app.get('superSecret'), function (err, decoded) {

            if (err) {
                res.clearCookie('logged');
                res.redirect('/');
            }

            req.token = decoded;
            next();

        });

    } else {
        res.redirect('/');
    }
});


// ###### GETELEVE ######

var geteleve = express.Router();


geteleve.param('id', function (req, res, next, id) {
    if (id == req.token.identifiant) {
        next();
    } else {
        req.params.id = req.token.identifiant;
        next();
    }
});

geteleve.get('/eleve/:id', function (req, res) {
    res.redirect('/eleve/' + req.params.id + '/administration');
});

geteleve.get('/eleve/:id/administration', function (req, res) {

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
                    if (err) return console.error("Erreur dans l'obtention de la classe de l'élève " + eleve.matricule);

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

geteleve.get('/eleve/:id/scolarite', function (req, res) {

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

            bdd.query("SELECT matiere, AVG(note1) as note1, AVG(note2) as note2, AVG(note3) as note3 FROM notes WHERE matricule = $1 GROUP BY matiere", [req.params.id], function (err, result) {
                if (err) return console.error("Erreur dans l'accès aux notes de l'élève");

                var notes = [];

                for (var i = 0; i < result.rows.length; i++) {
                    var moy = result.rows[i].note1 + result.rows[i].note2 + result.rows[i].note3;
                    moy /= 3;
                    notes.push({
                        matiere: result.rows[i].matiere,
                        moyenne: moy
                    });
                }

                console.log(notes);

                res.render('eleve/scolarite', {
                    eleve: eleve,
                    notes: notes
                });
            });
        }
    });
});

geteleve.get('/eleve/:id/sante', function (req, res) {

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

geteleve.get('/eleve/:id/contacts', function (req, res) {

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



// ###### POSTELEVE ######

var posteleve = express.Router();

posteleve.param('id', function (req, res, next, id) {
    if (id == req.token.identifiant) {
        next();
    } else {
        req.params.id = req.token.identifiant;
        next();
    }
});


posteleve.post('/eleve/:id/newphoto', upload.single('photo'), function (req, res) {

    // get the temporary location of the file
    var tmp_path = req.file.path;

    // set where the file should actually exists
    var target_path = './public/photos/' + req.params.id + '.jpg';

    bdd.query("UPDATE eleve SET photo = true WHERE matricule = $1", [req.params.id]);

    moveTo(tmp_path, target_path, function () {
        res.redirect('/eleve/' + req.params.id);
    });

});

posteleve.post('/eleve/:id/newadresse', function (req, res) {
    // CHECK SAFETY

    bdd.query("UPDATE contact SET adresse = $1, cp = $2, ville=$3 WHERE matricule_eleve = $4 AND nom_contact IS NULL;", [req.body.adresse, req.body.cp, req.body.ville, req.params.id]);

    res.redirect('/eleve/' + req.params.id);
});

posteleve.post('/eleve/:id/brandnewadresse', function (req, res) {
    // CHECK SAFETY

    bdd.query("INSERT INTO contact (adresse, cp, ville, matricule_eleve) VALUES ($1, $2, $3, $4)", [req.body.adresse, req.body.cp, req.body.ville, req.params.id]);

    res.redirect('/eleve/' + req.params.id + '/administration');
});

posteleve.post('/eleve/:id/brandnewcontact', function (req, res) {
    // CHECK SAFETY

    bdd.query("INSERT INTO contact (telephone_domicile, telephone_mobile, email, matricule_eleve) VALUES ($1, $2, $3, $4)", [req.body.telephone_domicile, req.body.telephone_mobile, req.body.email, req.params.id]);

    res.redirect('/eleve/' + req.params.id + '/administration');
});

posteleve.post('/eleve/:id/newcontact', function (req, res) {
    // CHECK SAFETY

    bdd.query("UPDATE contact SET telephone_domicile = $1, telephone_mobile = $2, email = $3 WHERE matricule_eleve = $4 AND nom_contact IS NULL", [req.body.telephone_domicile, req.body.telephone_mobile, req.body.email, req.params.id]);

    res.redirect('/eleve/' + req.params.id);
});

posteleve.post('/eleve/:id/newmedecin', function (req, res) {
    // CHECK SAFETY

    bdd.query("UPDATE eleve SET telephone_medecin = $1, nom_medecin = $2, prenom_medecin = $3 WHERE matricule = $4", [req.body.telephone_medecin, req.body.nom_medecin, req.body.prenom_medecin, req.params.id]);

    res.redirect('/eleve/' + req.params.id + '/sante');
});

posteleve.post('/eleve/:id/rem_med', function (req, res) {
    // CHECK SAFETY

    var escaped_text = (nl2br(req.body.rem_med));

    bdd.query("UPDATE eleve SET remarques_medicales = $1 WHERE matricule = $2", [escaped_text, req.params.id]);

    res.redirect('/eleve/' + req.params.id + '/sante');
});


// ####### GETADMIN #######

var getadmin = express.Router();

getadmin.param('id', function (req, res, next, id) {

    if (id == req.token.identifiant) {
        if (req.token.administrateur) // Need to be admin to proceed
            next();
        else
            res.redirect('/');
    } else {
        res.redirect('/');
    }

});


getadmin.get('/adm/:id', function (req, res) {

    res.redirect('/adm/' + req.params.id + '/eleve');

});

getadmin.get('/adm/:id/eleve', function (req, res) {

    res.render('admin/eleve', {
        admin: req.params.id
    });

});


getadmin.get('/adm/:id/eleve/modify', function (req, res) {

    bdd.query('SELECT * FROM eleve ORDER BY nom', function (err, result) {
        if (err) {
            return console.error('Erreur avec la table eleve', err);
        }
        if (result.rows) {
            res.render('admin/eleve_modify', {
                eleves: result.rows,
                admin: req.params.id
            });
        }
    });
});


getadmin.get('/adm/:id/notes', function (req, res) {

    bdd.query('SELECT nom, prenom, matricule FROM eleve', function (err, result) {
        if (err) return console.error("Erreur dans l'accès à la liste des élèves");

        res.render('admin/notes', {
            admin: req.params.id,
            eleves: result.rows
        });
    });
});

getadmin.get('/adm/:id/notes/:matricule', function (req, res) {

    res.render('admin/notes_action', {
        admin: req.params.id,
        matricule: req.params.matricule
    });

});

getadmin.get('/adm/:id/notes/:matricule/add', function (req, res) {

    //Calcul de l'id CLASSE

    bdd.query('SELECT id_classe FROM classe WHERE id_classe IN (SELECT id_classe FROM est_dans_classe WHERE matricule = $1) AND annee = (SELECT MAX(annee) FROM (SELECT annee FROM classe WHERE id_classe IN (SELECT id_classe FROM est_dans_classe WHERE matricule = $1)) AS max)',   [req.params.matricule], function (err, result) {
        if (err) return console.error("Erreur dans l'obtention de la classe de l'élève " + eleve.matricule);

        if (result.rows[0] && result.rows[0].id_classe) {
            res.render('admin/ajout_notes_form', {
                admin: req.params.id,
                id_classe: result.rows[0].id_classe,
                matricule: req.params.matricule
            });
        } else {
            res.render('admin/ajout_notes_form', {
                admin: req.params.id,
                id_classe: null,
                matricule: req.params.matricule
            })
        }
    });

});


getadmin.get('/adm/:id/notes/:matricule/modify', function (req, res) {

    bdd.query("SELECT classe.id_classe, annee, matiere, note1, note2, note3 FROM classe, notes WHERE notes.matricule = $1 AND notes.id_classe = classe.id_classe ORDER BY annee, matiere", [req.params.matricule], function (err, result) {
        if (err) return console.error("Erreur dans l'accès aux notes");

        if (result.rows[0]) {
            res.render('admin/notes_modif', {
                admin: req.params.id,
                matricule: req.params.matricule,
                notes: result.rows
            });
        } else {
            res.render('admin/notes_modif', {
                admin: req.params.id,
                matricule: req.params.matricule,
                notes: null
            });
        }
    });

});

getadmin.get('/adm/:id/classe', function (req, res) {

    res.render('admin/classe', {
        admin: req.params.id
    });

});



// ####### POSTADMIN #######

var postadmin = express.Router();

postadmin.param('id', function (req, res, next, id) {

    if (id == req.token.identifiant) {
        if (req.token.administrateur) // Need to be admin to proceed
            next();
        else
            res.redirect('/');
    } else {
        res.redirect('/');
    }

});


var eleveUpload = upload.fields([{
    name: 'convocation',
    maxCount: 1
}, {
    name: 'bulletin',
    maxCount: 1
}]);


postadmin.post('/adm/:id/eleve/add', eleveUpload, function (req, res) {

    // IL FAUT :
    // CHECKER LES INFOS

    // ... ###############

    // CREER LA LIGNE DE L'ELEVE

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

    // ON RECUPERE LE MATRICULE


    bdd.query("SELECT MAX(matricule) FROM eleve", function (err, result) {
        if (err) return console.log("Erreur dans l'obtention du matricule");

        var matricule = result.rows[0].max;

        // CREER UNE LIGNE ADRESSE

        bdd.query("INSERT INTO contact (adresse, cp, ville, telephone_domicile, telephone_mobile, email, nom_contact, prenom_contact, matricule_eleve ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [req.body.adresse, req.body.cp, req.body.ville, req.body.telephone_domicile, req.body.telephone_mobile, req.body.email, null, null, matricule]);

        // CREER UNE LIGNE PASSWORD

        bdd.query("INSERT INTO password (identifiant, mot_de_passe, administrateur, professeur) VALUES ($1, $2, $3, $4)", [matricule, matricule, false, false]);



        // UPLOAD DOCUMENTS

        if (req.files['convocation'] && req.files['convocation'][0]) {

            var convoc = req.files['convocation'][0];
            var extension = '.txt';

            var tmp_path = convoc.path;
            var target_path = './public/document/convocation/' + matricule + extension;
            moveTo(tmp_path, target_path, function () {});

            bdd.query("UPDATE eleve SET convocation = true WHERE matricule = $1", [matricule]);
        }

        if (req.files['bulletin'] && req.files['bulletin'][0]) {

            var bulletin = req.files['bulletin'][0];
            var extension = '.pdf';

            var tmp_path = bulletin.path;
            var target_path = './public/document/bulletin/' + matricule + extension;
            moveTo(tmp_path, target_path, function () {});

            bdd.query("UPDATE eleve SET bulletin = true WHERE matricule = $1", [matricule]);
        }


    });

    res.redirect('/adm/' + req.params.id);

});

postadmin.post('/adm/:id/eleve/modify/:matricule', function (req, res) {

    bdd.query("UPDATE eleve SET prenom = $1, nom = $2, ville_naissance = $3, pays_naissance = $4, etablissement_precedent = $5, nom_medecin = $6, prenom_medecin = $7, telephone_medecin = $8, remarques_medicales = $9 WHERE matricule = $10", [
        req.body.prenom,
        req.body.nom,
        req.body.ville_naissance,
        req.body.pays_naissance,
        req.body.etablissement_precedent,
        req.body.nom_medecin,
        req.body.prenom_medecin,
        req.body.telephone_medecin,
        req.body.remarques_medicales,
        req.params.matricule
    ]);

    // MODIF CONTACTS
    // MODIF ADRESSE
    // MODIF FICHIERS

    res.redirect('/adm/' + req.params.id + '/eleve/modify');

});


postadmin.post('/adm/:id/notes/:matricule/add', function (req, res) {

    bdd.query("INSERT INTO notes (id_classe, matricule, matiere, note1, note2, note3) VALUES ($1, $2, $3, $4, $5, $6)", [req.body.id_classe, req.body.matricule, req.body.matiere, req.body.note1, req.body.note2, req.body.note3]);

    res.redirect('/adm/' + req.params.id + '/notes/' + req.params.matricule);

});


postadmin.post('/adm/:id/notes/:matricule/modify', function (req, res) {

    bdd.query("UPDATE notes SET matiere = $1, note1 = $2, note2 = $3, note3 = $4 WHERE id_classe = $5 AND matricule = $6", [req.body.matiere, req.body.note1, req.body.note2, req.body.note3, req.body.id_classe, req.body.matricule]);

    res.redirect('/adm/' + req.params.id + '/notes/' + req.params.matricule + '/modify');

});


// ################################################

app.use('/', root);
app.use('/', checking);
app.use('/', geteleve);
app.use('/', posteleve);
app.use('/', getadmin);
app.use('/', postadmin);
