<?php
/**
 * API Masque de Document POGE
 * 
 * Retourne le masque de document avec la liste des praticiens à jour.
 * Utilisable par n'importe quelle application.
 * 
 * GET /api/document-mask.php
 * GET /api/document-mask.php?template_id=1
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configuration DB
$dbHost = '10.10.10.140';
$dbName = 'poge_erp';
$dbUser = 'poge_salaires';
$dbPass = 'Griotte24';

// Hierarchie
$hierarchyLevels = [
    'Directeur' => 0,
    'Directeur adjoint' => 1,
    'Chef de Clinique Adjoint' => 2,
    'Cheffe de Clinique Adjointe' => 2,
    'Cheffe de Clinique adjonte' => 2,
    'Stagiaire CRS' => 3,
    'Stagiaire HedS' => 4,
];

$displayTitles = [
    'Directeur' => "Directeur\nResponsable de Clinique",
    'Directeur adjoint' => "Directeur Adjoint\nResponsable de Clinique",
    'Chef de Clinique Adjoint' => 'Chef de Clinique Adjoint',
    'Cheffe de Clinique Adjointe' => 'Cheffe de Clinique Adjointe',
    'Cheffe de Clinique adjonte' => 'Cheffe de Clinique Adjointe',
    'Stagiaire CRS' => 'Stagiaire CRS',
    'Stagiaire HedS' => 'Stagiaire HedS',
];

$defaultCertifications = [
    'Directeur' => ['Certifié C.D.S', 'Membre OstéoSwiss'],
    'Directeur adjoint' => ['Certifié C.D.S', 'Membre OstéoSwiss'],
    'Chef de Clinique Adjoint' => ['Certifié CDS'],
    'Cheffe de Clinique Adjointe' => ['Certifiée CDS'],
    'Cheffe de Clinique adjonte' => ['Certifiée CDS'],
    'Stagiaire CRS' => ['Stagiaire CRS'],
    'Stagiaire HedS' => ['Stagiaire HedS'],
];

try {
    $pdo = new PDO(
        "mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4",
        $dbUser,
        $dbPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Template par defaut
    $template = [
        'id' => 0,
        'name' => 'Masque POGE Standard',
        'logo_url' => '/logo-poge.png',
        'slogan_line1' => 'Pour toute urgence, un',
        'slogan_line2' => 'rdv vous est proposé',
        'slogan_line3' => 'dans la journée.',
        'footer_company_name' => 'Permanence Ostéopathique de Genève',
        'footer_address' => 'Rue du Rhône 14',
        'footer_city' => '1204 Genève',
        'footer_phone' => '022 310 22 55',
        'footer_phone_link' => 'tel:+41223102255',
        'footer_email' => 'contact@poge.ch',
        'footer_email_link' => 'mailto:contact@poge.ch',
        'footer_website' => 'www.poge.ch',
        'footer_website_link' => 'https://www.poge.ch',
        'footer_font_size' => '7',
        'footer_alignment' => 'center',
        'footer_line_spacing' => '1.4',
        'footer_format_line1' => '{company} - {address}, {city}',
        'footer_format_line2' => 'Tél: {phone} | Email: {email} | {website}',
        'is_default' => true,
    ];

    // Essayer de charger depuis la table si elle existe
    try {
        $templateId = isset($_GET['template_id']) ? intval($_GET['template_id']) : null;
        
        if ($templateId) {
            $stmt = $pdo->prepare("SELECT * FROM document_templates WHERE id = ?");
            $stmt->execute([$templateId]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM document_templates WHERE is_default = 1 LIMIT 1");
            $stmt->execute();
        }
        
        $dbTemplate = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($dbTemplate) {
            $template = $dbTemplate;
        }
    } catch (PDOException $e) {
        // Table n'existe pas encore, on utilise les valeurs par defaut
    }

    // Recuperer les praticiens actifs
    $stmt = $pdo->prepare("
        SELECT 
            employee_id,
            JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom')) as prenom,
            JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom')) as nom,
            JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.sexe')) as sexe,
            JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.hrStatus.fonction')) as fonction,
            JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.hrStatus.date_entree')) as date_entree,
            JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.hrStatus.date_sortie')) as date_sortie,
            JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.certifications.rme_rcc')) as rme_rcc
        FROM employees
        WHERE JSON_EXTRACT(profile_json, '$.hrStatus.collaborateur_actif') = true
        ORDER BY date_entree ASC
    ");
    $stmt->execute();
    $employees = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Filtrer les employes dont la date de sortie est passee
    $today = date('Y-m-d');
    $activeEmployees = array_filter($employees, function($emp) use ($today) {
        if (empty($emp['date_sortie']) || $emp['date_sortie'] === 'null') {
            return true;
        }
        return $emp['date_sortie'] > $today;
    });

    // Trier les praticiens
    usort($activeEmployees, function($a, $b) use ($hierarchyLevels) {
        // Gregory Nykiel en premier
        $aIsGregory = (stripos($a['prenom'], 'grégory') !== false || stripos($a['prenom'], 'gregory') !== false) 
                      && stripos($a['nom'], 'nykiel') !== false;
        $bIsGregory = (stripos($b['prenom'], 'grégory') !== false || stripos($b['prenom'], 'gregory') !== false) 
                      && stripos($b['nom'], 'nykiel') !== false;
        
        if ($aIsGregory) return -1;
        if ($bIsGregory) return 1;
        
        // Pascal Pagano en second
        $aIsPascal = stripos($a['prenom'], 'pascal') !== false && stripos($a['nom'], 'pagano') !== false;
        $bIsPascal = stripos($b['prenom'], 'pascal') !== false && stripos($b['nom'], 'pagano') !== false;
        
        if ($aIsPascal) return -1;
        if ($bIsPascal) return 1;
        
        // Par hierarchie
        $hierA = $hierarchyLevels[$a['fonction']] ?? 99;
        $hierB = $hierarchyLevels[$b['fonction']] ?? 99;
        
        if ($hierA !== $hierB) {
            return $hierA - $hierB;
        }
        
        // Par anciennete
        $dateA = strtotime($a['date_entree'] ?? '2099-01-01');
        $dateB = strtotime($b['date_entree'] ?? '2099-01-01');
        return $dateA - $dateB;
    });

    // Formater les praticiens
    $practitioners = [];
    foreach ($activeEmployees as $emp) {
        $fonction = $emp['fonction'] ?? '';
        $sexe = strtolower($emp['sexe'] ?? '');
        $isFemale = in_array($sexe, ['femme', 'f', 'féminin', 'female']);
        
        // Titre d'affichage
        $displayTitle = $displayTitles[$fonction] ?? $fonction;
        
        // Certifications
        $certs = $defaultCertifications[$fonction] ?? [];
        
        // Accord feminin pour "Certifie"
        if ($isFemale) {
            $certs = array_map(function($cert) {
                return str_replace('Certifié', 'Certifiée', $cert);
            }, $certs);
        }
        
        $practitioners[] = [
            'employee_id' => intval($emp['employee_id']),
            'prenom' => $emp['prenom'],
            'nom' => $emp['nom'],
            'fonction' => $fonction,
            'displayTitle' => $displayTitle,
            'certifications' => $certs,
            'rme_rcc' => $emp['rme_rcc'] ?: null,
            'date_entree' => $emp['date_entree'],
        ];
    }

    // Reponse
    echo json_encode([
        'success' => true,
        'template' => $template,
        'practitioners' => array_values($practitioners),
        'generatedAt' => date('c'),
        'practitionerCount' => count($practitioners)
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur base de données: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur: ' . $e->getMessage()
    ]);
}

