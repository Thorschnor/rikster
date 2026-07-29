/* ============================================================
   RIKSTER – Hinweise (komplett offline)
   ------------------------------------------------------------
   Zwei Quellen, die zusammengeworfen werden:
   1) Kontext-Hinweise aus Tabellen (Kanzler, US-Präsident, WM,
      Olympia, Alltag/Technik) – die decken JEDES Jahr ab.
   2) Handverlesene Ereignisse pro Jahr.
   Regel: In keinem Hinweis darf die Jahreszahl vorkommen.
   ============================================================ */

'use strict';

/* [von, bis, Name] – bis einschließlich */
var HINT_KANZLER = [
  [1949, 1963, 'Konrad Adenauer'], [1963, 1966, 'Ludwig Erhard'],
  [1966, 1969, 'Kurt Georg Kiesinger'], [1969, 1974, 'Willy Brandt'],
  [1974, 1982, 'Helmut Schmidt'], [1982, 1998, 'Helmut Kohl'],
  [1998, 2005, 'Gerhard Schröder'], [2005, 2021, 'Angela Merkel'],
  [2021, 2025, 'Olaf Scholz'], [2025, 2030, 'Friedrich Merz']
];

var HINT_US = [
  [1945, 1953, 'Harry S. Truman'], [1953, 1961, 'Dwight D. Eisenhower'],
  [1961, 1963, 'John F. Kennedy'], [1963, 1969, 'Lyndon B. Johnson'],
  [1969, 1974, 'Richard Nixon'], [1974, 1977, 'Gerald Ford'],
  [1977, 1981, 'Jimmy Carter'], [1981, 1989, 'Ronald Reagan'],
  [1989, 1993, 'George H. W. Bush'], [1993, 2001, 'Bill Clinton'],
  [2001, 2009, 'George W. Bush'], [2009, 2017, 'Barack Obama'],
  [2017, 2021, 'Donald Trump'], [2021, 2025, 'Joe Biden'],
  [2025, 2030, 'Donald Trump']
];

/* Jahr: [Gastgeber, Weltmeister] */
var HINT_WM = {
  1950: ['Brasilien', 'Uruguay'], 1954: ['der Schweiz', 'Deutschland'],
  1958: ['Schweden', 'Brasilien'], 1962: ['Chile', 'Brasilien'],
  1966: ['England', 'England'], 1970: ['Mexiko', 'Brasilien'],
  1974: ['Deutschland', 'Deutschland'], 1978: ['Argentinien', 'Argentinien'],
  1982: ['Spanien', 'Italien'], 1986: ['Mexiko', 'Argentinien'],
  1990: ['Italien', 'Deutschland'], 1994: ['den USA', 'Brasilien'],
  1998: ['Frankreich', 'Frankreich'], 2002: ['Japan und Südkorea', 'Brasilien'],
  2006: ['Deutschland', 'Italien'], 2010: ['Südafrika', 'Spanien'],
  2014: ['Brasilien', 'Deutschland'], 2018: ['Russland', 'Frankreich'],
  2022: ['Katar', 'Argentinien']
};

var HINT_OLYMPIA = {
  1952: 'Helsinki', 1956: 'Melbourne', 1960: 'Rom', 1964: 'Tokio',
  1968: 'Mexiko-Stadt', 1972: 'München', 1976: 'Montreal', 1980: 'Moskau',
  1984: 'Los Angeles', 1988: 'Seoul', 1992: 'Barcelona', 1996: 'Atlanta',
  2000: 'Sydney', 2004: 'Athen', 2008: 'Peking', 2012: 'London',
  2016: 'Rio de Janeiro', 2021: 'Tokio', 2024: 'Paris'
};

/* [von, bis, Hinweistext] – Alltag, Technik, Zeitgeschehen */
var HINT_EPOCHEN = [
  [1949, 1990, 'Deutschland war in zwei Staaten geteilt.'],
  [1961, 1989, 'Die Berliner Mauer stand noch.'],
  [1990, 2025, 'Deutschland war bereits wiedervereinigt.'],
  [1948, 2001, 'In Deutschland wurde mit D-Mark bezahlt.'],
  [2002, 2030, 'In Deutschland wurde mit Euro bezahlt.'],
  [1955, 1975, 'Der Kalte Krieg prägte die Weltpolitik, Westdeutschland erlebte das Wirtschaftswunder.'],
  [1950, 1966, 'Fernsehen war noch schwarzweiß.'],
  [1967, 1985, 'Farbfernsehen war die große Neuerung in den Wohnzimmern.'],
  [1950, 1962, 'In Westdeutschland gab es nur ein einziges Fernsehprogramm.'],
  [1963, 1984, 'Im Fernsehen gab es im Wesentlichen ARD und ZDF.'],
  [1985, 1999, 'Privatsender wie RTL und SAT.1 mischten das Fernsehen auf.'],
  [1950, 1962, 'Musik kam vor allem von der Schallplatte oder aus dem Radio.'],
  [1975, 1992, 'Lieblingslieder wurden aus dem Radio auf Kassette mitgeschnitten.'],
  [1985, 1998, 'Die CD verdrängte nach und nach die Schallplatte.'],
  [1999, 2008, 'MP3-Player und Musiktauschbörsen krempelten das Musikhören um.'],
  [2012, 2030, 'Die meisten hörten Musik längst per Streaming.'],
  [1950, 1985, 'Ein Telefon hing an der Wand und hatte eine Wählscheibe.'],
  [1994, 2003, 'Handys wurden allmählich für jeden erschwinglich.'],
  [2004, 2012, 'Fast jeder hatte ein Handy, aber Klapphandys und Tasten waren normal.'],
  [2010, 2030, 'Smartphones mit Touchscreen gehörten zum Alltag.'],
  [1950, 1993, 'Das Internet spielte im Alltag noch keine Rolle.'],
  [1996, 2004, 'Das Internet kam per Modem oder ISDN ins Haus und war langsam.'],
  [2007, 2030, 'Soziale Netzwerke bestimmten mit, worüber gesprochen wurde.'],
  [1950, 1992, 'In Deutschland galten noch vierstellige Postleitzahlen.'],
  [1993, 2030, 'In Deutschland galten fünfstellige Postleitzahlen.'],
  [1950, 1994, 'Die Bundesbahn fuhr noch ohne ICE-Netz in heutiger Form.'],
  [2011, 2030, 'Deutschland hatte den Ausstieg aus der Atomkraft beschlossen.'],
  [1957, 1990, 'Die Sowjetunion existierte noch.'],
  [1992, 2030, 'Die Sowjetunion gab es nicht mehr.']
];


var HINT_BPRAES = [
  [1949, 1959, 'Theodor Heuss'], [1959, 1969, 'Heinrich Lübke'],
  [1969, 1974, 'Gustav Heinemann'], [1974, 1979, 'Walter Scheel'],
  [1979, 1984, 'Karl Carstens'], [1984, 1994, 'Richard von Weizsäcker'],
  [1994, 1999, 'Roman Herzog'], [1999, 2004, 'Johannes Rau'],
  [2004, 2010, 'Horst Köhler'], [2010, 2012, 'Christian Wulff'],
  [2012, 2017, 'Joachim Gauck'], [2017, 2030, 'Frank-Walter Steinmeier']
];

var HINT_DDR = [
  [1950, 1971, 'Walter Ulbricht'], [1971, 1989, 'Erich Honecker']
];

var HINT_PAPST = [
  [1939, 1958, 'Pius XII.'], [1958, 1963, 'Johannes XXIII.'],
  [1963, 1978, 'Paul VI.'], [1978, 2005, 'Johannes Paul II.'],
  [2005, 2013, 'Benedikt XVI.'], [2013, 2025, 'Franziskus'],
  [2025, 2030, 'Leo XIV.']
];

var HINT_UK = [
  [1951, 1955, 'Winston Churchill'], [1955, 1957, 'Anthony Eden'],
  [1957, 1963, 'Harold Macmillan'], [1964, 1970, 'Harold Wilson'],
  [1970, 1974, 'Edward Heath'], [1974, 1976, 'Harold Wilson'],
  [1976, 1979, 'James Callaghan'], [1979, 1990, 'Margaret Thatcher'],
  [1990, 1997, 'John Major'], [1997, 2007, 'Tony Blair'],
  [2007, 2010, 'Gordon Brown'], [2010, 2016, 'David Cameron'],
  [2016, 2019, 'Theresa May'], [2019, 2022, 'Boris Johnson'],
  [2022, 2024, 'Rishi Sunak'], [2024, 2030, 'Keir Starmer']
];

/* Jahr: [Gastgeber, Europameister] */
var HINT_EM = {
  1960: ['Frankreich', 'die Sowjetunion'], 1964: ['Spanien', 'Spanien'],
  1968: ['Italien', 'Italien'], 1972: ['Belgien', 'Deutschland'],
  1976: ['Jugoslawien', 'die Tschechoslowakei'], 1980: ['Italien', 'Deutschland'],
  1984: ['Frankreich', 'Frankreich'], 1988: ['Deutschland', 'die Niederlande'],
  1992: ['Schweden', 'Dänemark'], 1996: ['England', 'Deutschland'],
  2000: ['Belgien und den Niederlanden', 'Frankreich'], 2004: ['Portugal', 'Griechenland'],
  2008: ['Österreich und der Schweiz', 'Spanien'], 2012: ['Polen und der Ukraine', 'Spanien'],
  2016: ['Frankreich', 'Portugal'], 2021: ['ganz Europa', 'Italien'],
  2024: ['Deutschland', 'Spanien']
};

var HINT_WINTER = {
  1952: 'Oslo', 1956: 'Cortina d\'Ampezzo', 1960: 'Squaw Valley', 1964: 'Innsbruck',
  1968: 'Grenoble', 1972: 'Sapporo', 1976: 'Innsbruck', 1980: 'Lake Placid',
  1984: 'Sarajevo', 1988: 'Calgary', 1992: 'Albertville', 1994: 'Lillehammer',
  1998: 'Nagano', 2002: 'Salt Lake City', 2006: 'Turin', 2010: 'Vancouver',
  2014: 'Sotschi', 2018: 'Pyeongchang', 2022: 'Peking'
};

var HINT_EPOCHEN2 = [
  [1950, 1998, 'Die Hauptstadt der Bundesrepublik war Bonn.'],
  [1999, 2030, 'Regierung und Bundestag saßen in Berlin.'],
  [1949, 1961, 'Wer die DDR verlassen wollte, konnte das noch über Berlin tun.'],
  [1949, 1990, 'Wer nach West-Berlin wollte, musste durch die DDR fahren.'],
  [1955, 2011, 'In Deutschland gab es die Wehrpflicht.'],
  [2011, 2030, 'Die Wehrpflicht in Deutschland war ausgesetzt.'],
  [1950, 1968, 'Schlager und die ersten Beatbands teilten sich das Radio.'],
  [1975, 1982, 'Die Discowelle beherrschte die Tanzflächen.'],
  [1982, 1989, 'Synthesizer-Pop und Neue Deutsche Welle prägten den Sound.'],
  [1991, 1999, 'Techno und Eurodance liefen in den Clubs.'],
  [1996, 2006, 'Boygroups, Girlgroups und die ersten Castingshows bestimmten die Charts.'],
  [2008, 2016, 'Elektro-Beats und Party-Hits liefen im Radio rauf und runter.'],
  [1980, 1996, 'Der Walkman gehörte zur Grundausstattung Jugendlicher.'],
  [1995, 2007, 'Tragbare CD-Player waren unterwegs die erste Wahl.'],
  [2002, 2012, 'Der iPod war das Statussymbol der Musikfans.'],
  [1953, 1975, 'Zigarettenwerbung im Fernsehen war ganz normal.'],
  [1996, 2010, 'Man verabredete sich per SMS.'],
  [2011, 2030, 'Man verabredete sich per Messenger-App.'],
  [1950, 1972, 'Auf deutschen Straßen fuhren viele Käfer und Isettas.'],
  [1974, 1990, 'Der VW Golf löste den Käfer als meistgekauftes Auto ab.'],
  [2020, 2022, 'Die Corona-Pandemie bestimmte den Alltag.'],
  [1990, 1998, 'Der Aufbau Ost und der Solidaritätszuschlag prägten die Politik.'],
  [1957, 1991, 'Die Sowjetunion und die USA standen sich als Supermächte gegenüber.'],
  [2004, 2030, 'Die Europäische Union hatte mehr als zwanzig Mitgliedstaaten.'],
  [1950, 1994, 'Ferngespräche waren teuer, man fasste sich am Telefon kurz.'],
  [2015, 2030, 'Nahezu jeder Haushalt hatte schnelles Internet.']
];

/* Handverlesene Ereignisse je Jahr – niemals mit Jahreszahl im Text */
var HINT_EREIGNISSE = {
  1950: [
    'Der Koreakrieg brach aus.',
    'Uruguay gewann die Fußball-WM in Brasilien im entscheidenden Spiel gegen den Gastgeber.',
    'In Westdeutschland herrschte Aufbaustimmung, vieles war noch zerstört.',
    'Die Lebensmittelrationierung lief in Westdeutschland aus.',
    'Der VW Käfer wurde zum Symbol des beginnenden Wohlstands.',
    'In den Wohnzimmern stand das Radio im Mittelpunkt.',
    'Die Bundesrepublik trat dem Europarat bei.',
    'Der Film „Sunset Boulevard" kam in die Kinos.'
  ],
  1951: [
    'In Westdeutschland lief das Wirtschaftswunder an.',
    'Der Farbfernseh-Betrieb startete versuchsweise in den USA.',
    'Die Montanunion wurde als Vorläufer der EU gegründet.',
    'Das Bundesverfassungsgericht nahm seine Arbeit auf.',
    'Die Berliner Filmfestspiele fanden zum ersten Mal statt.',
    'In Deutschland war der Wiederaufbau der Städte in vollem Gang.',
    'Der Film „Endstation Sehnsucht" kam ins Kino.',
    'Rock \'n\' Roll steckte noch in den Anfängen, Schlager beherrschten das Radio.'
  ],
  1952: [
    'Elisabeth II. bestieg den britischen Thron.',
    'Die Olympischen Spiele fanden in Helsinki statt.',
    'In der DDR wurden die Länder aufgelöst und Bezirke eingeführt.',
    'Das Wiedergutmachungsabkommen mit Israel wurde unterzeichnet.',
    'Der erste Fernsehprogrammbetrieb startete in Westdeutschland regelmäßig.',
    'Die Sowjetunion schlug in der Stalin-Note ein neutrales Gesamtdeutschland vor.',
    'Der Film „Zwölf Uhr mittags" kam in die Kinos.',
    'Die erste Wasserstoffbombe wurde gezündet.'
  ],
  1953: [
    'In der DDR wurde der Volksaufstand am 17. Juni niedergeschlagen.',
    'Josef Stalin starb.',
    'Der Mount Everest wurde erstmals bestiegen.',
    'Die Struktur der DNA wurde entschlüsselt.',
    'Der Koreakrieg endete mit einem Waffenstillstand.',
    'Elisabeth II. wurde in London gekrönt.',
    'In Westdeutschland gewann die Union die Bundestagswahl deutlich.',
    'Der Film „Krieg der Welten" kam ins Kino.'
  ],
  1954: [
    'Deutschland gewann das „Wunder von Bern" und wurde Fußball-Weltmeister.',
    'Der Vietnamkrieg der Franzosen endete mit der Niederlage von Dien Bien Phu.',
    'Elvis Presley nahm seine ersten Songs auf.',
    'In Westdeutschland begann der Bau der ersten Autobahnabschnitte nach dem Krieg wieder.',
    'Der Film „Das Fenster zum Hof" von Hitchcock kam ins Kino.',
    'Theodor Heuss wurde als Bundespräsident wiedergewählt.',
    'Der erste Atom-U-Boot-Antrieb ging in Betrieb.',
    'Die Rundfunkanstalten der ARD starteten ein gemeinsames Fernsehprogramm.'
  ],
  1955: [
    'Die Bundesrepublik trat der NATO bei, die DDR dem Warschauer Pakt.',
    'Österreich erhielt mit dem Staatsvertrag seine Souveränität zurück.',
    'James Dean starb bei einem Autounfall.',
    'Der Rock \'n\' Roll erreichte mit Bill Haley die Charts.',
    'Disneyland eröffnete in Kalifornien.',
    'Die letzten deutschen Kriegsgefangenen kehrten aus der Sowjetunion zurück.',
    'Die Bundeswehr wurde aufgestellt.',
    'Der Film „Die Brücke am Kwai" wurde vorbereitet, Kriegsfilme prägten das Kino.'
  ],
  1956: [
    'Der Ungarn-Aufstand wurde von sowjetischen Truppen niedergeschlagen.',
    'Die Suezkrise brachte den Nahen Osten an den Rand eines Krieges.',
    'Elvis Presley landete mit „Heartbreak Hotel" seinen Durchbruch.',
    'Die Olympischen Spiele fanden in Melbourne statt.',
    'Grace Kelly heiratete den Fürsten von Monaco.',
    'In der Bundesrepublik wurde die Wehrpflicht eingeführt.',
    'Der erste Transatlantik-Telefonkabel wurde in Betrieb genommen.',
    'Die KPD wurde in der Bundesrepublik verboten.'
  ],
  1957: [
    'Der Satellit Sputnik läutete das Weltraumzeitalter ein.',
    'Die Römischen Verträge begründeten die Europäische Wirtschaftsgemeinschaft.',
    'Das Saarland wurde Teil der Bundesrepublik.',
    'Die Rentenreform brachte die dynamische Rente.',
    'Konrad Adenauer gewann die Wahl mit absoluter Mehrheit.',
    'Der Film „Die zwölf Geschworenen" kam ins Kino.',
    'Die Hündin Laika flog als erstes Lebewesen ins All.',
    'In Westdeutschland kamen die ersten Supermärkte auf.'
  ],
  1958: [
    'Brasilien gewann die Fußball-WM in Schweden, ein junger Pelé wurde zum Star.',
    'Beim Flugzeugunglück von München verunglückte die Mannschaft von Manchester United.',
    'Die NASA wurde gegründet.',
    'Charles de Gaulle wurde französischer Regierungschef.',
    'Der erste Mikrochip wurde vorgestellt.',
    'In der Bundesrepublik wurde die Gleichberechtigung im Familienrecht gestärkt.',
    'Die Weltausstellung fand in Brüssel statt, das Atomium entstand.',
    'Der Hula-Hoop-Reifen wurde zur weltweiten Mode.'
  ],
  1959: [
    'Fidel Castro übernahm nach der Revolution die Macht in Kuba.',
    'Die SPD beschloss in Bad Godesberg ihr neues Grundsatzprogramm.',
    'Die Barbie-Puppe kam auf den Markt.',
    'Der Mini wurde in Großbritannien vorgestellt.',
    'Eine sowjetische Sonde erreichte als erste den Mond.',
    'Buddy Holly starb bei einem Flugzeugabsturz.',
    'In Westdeutschland wuchs der Wohlstand spürbar, Urlaubsreisen nach Italien kamen in Mode.',
    'Der Film „Manche mögen\'s heiß" kam ins Kino.'
  ],
  1960: [
    'Die Antibabypille kam in den USA auf den Markt.',
    'Alfred Hitchcocks Film „Psycho" kam ins Kino.',
    'Die Beatles spielten ihre ersten Auftritte in Hamburg.',
    'Elvis Presley kehrte aus dem Militärdienst in Deutschland zurück.',
    'Cassius Clay, später Muhammad Ali, gewann olympisches Gold im Boxen.',
    'In Afrika wurden binnen eines Jahres siebzehn Staaten unabhängig.',
    'Der erste funktionierende Laser wurde gebaut.',
    'John F. Kennedy gewann die US-Präsidentschaftswahl gegen Richard Nixon.',
    'Der VW Käfer war das meistverkaufte Auto in Deutschland.',
    'In der DDR wurde die Landwirtschaft zwangsweise in Genossenschaften zusammengefasst.',
    'Der erste Wettersatellit schickte Bilder aus dem All zur Erde.',
    'Die Olympischen Sommerspiele wurden erstmals live in viele Länder übertragen.'
  ],
  1961: [
    'In Berlin wurde über Nacht die Mauer gebaut.',
    'Juri Gagarin flog als erster Mensch ins All.',
    'John F. Kennedy trat sein Amt als US-Präsident an.',
    'Die Invasion in der Schweinebucht auf Kuba scheiterte.',
    'Die Antibabypille kam auch in Deutschland auf den Markt.',
    'Die DDR riegelte die Grenze nach West-Berlin vollständig ab.',
    'Der Film „Frühstück bei Tiffany" mit Audrey Hepburn lief an.',
    'Bob Dylan trat erstmals in New Yorker Clubs auf.',
    'Amnesty International wurde gegründet.',
    'Der erste Mensch im All war ein Sowjetbürger – der Wettlauf ins All ging in die nächste Runde.'
  ],
  1962: [
    'Die Kubakrise brachte die Welt an den Rand eines Atomkriegs.',
    'Eine schwere Sturmflut überschwemmte große Teile Hamburgs.',
    'Die Spiegel-Affäre erschütterte die Bundesregierung.',
    'Der erste James-Bond-Film „James Bond jagt Dr. No" kam ins Kino.',
    'Marilyn Monroe starb in Los Angeles.',
    'Die Beatles nahmen ihre erste Single auf und Ringo Starr kam zur Band.',
    'John Glenn umrundete als erster Amerikaner die Erde.',
    'Das Zweite Vatikanische Konzil wurde eröffnet.',
    'Ein Grubenunglück in Völklingen forderte viele Todesopfer.',
    'Die Rolling Stones traten zum ersten Mal in London auf.'
  ],
  1963: [
    'US-Präsident John F. Kennedy wurde in Dallas erschossen.',
    'Kennedy sagte in West-Berlin den Satz „Ich bin ein Berliner".',
    'Konrad Adenauer trat als Bundeskanzler zurück, Ludwig Erhard folgte ihm.',
    'Die Fußball-Bundesliga wurde gegründet und startete ihre erste Saison.',
    'Das ZDF nahm den Sendebetrieb auf.',
    'Martin Luther King hielt seine Rede „I Have a Dream" in Washington.',
    'Der Élysée-Vertrag besiegelte die deutsch-französische Freundschaft.',
    'Die Beatles veröffentlichten ihr erstes Album und lösten in Großbritannien die Beatlemania aus.',
    'Ein großer Postraub in England machte weltweit Schlagzeilen.',
    'Der Vulkan Surtsey stieg vor Island aus dem Meer auf.'
  ],
  1964: [
    'Die Olympischen Spiele fanden erstmals in Asien statt.',
    'Nelson Mandela wurde in Südafrika zu lebenslanger Haft verurteilt.',
    'Die Beatles eroberten mit ihrem Auftritt in der Ed Sullivan Show die USA.',
    'Muhammad Ali gewann erstmals den Schwergewichtstitel im Boxen.',
    'In den USA wurde das Bürgerrechtsgesetz gegen die Rassentrennung verabschiedet.',
    'Der millionste Gastarbeiter wurde in Deutschland begrüßt und bekam ein Moped geschenkt.',
    'Nikita Chruschtschow wurde in der Sowjetunion abgesetzt.',
    'Der Vietnamkrieg weitete sich nach dem Tonkin-Zwischenfall aus.',
    'Der Film „Mary Poppins" kam in die Kinos.',
    'Die ersten Tonbandkassetten kamen auf den Markt.'
  ],
  1965: [
    'Die Bundesrepublik nahm diplomatische Beziehungen zu Israel auf.',
    'Winston Churchill starb und wurde mit einem Staatsbegräbnis geehrt.',
    'Die Rolling Stones landeten mit „(I Can\'t Get No) Satisfaction" ihren Durchbruch.',
    'Die USA begannen mit der massiven Bombardierung Nordvietnams.',
    'Der erste Weltraumspaziergang gelang einem sowjetischen Kosmonauten.',
    'Bob Dylan trat beim Newport Folk Festival erstmals mit E-Gitarre auf und sorgte für einen Eklat.',
    'Die Fernsehserie „Flipper" begeisterte die Zuschauer.',
    'Der Film „Meine Lieder – meine Träume" mit Julie Andrews kam ins Kino.',
    'Die Minirock-Mode aus London eroberte Europa.',
    'In der DDR wurde das Fernsehen zum wichtigsten Massenmedium.'
  ],
  1966: [
    'England wurde im eigenen Land Fußball-Weltmeister, das Wembley-Tor sorgte für Streit.',
    'In Deutschland begann die Große Koalition unter Kurt Georg Kiesinger.',
    'In China begann die Kulturrevolution.',
    'Die Fernsehserie „Raumschiff Enterprise" wurde erstmals ausgestrahlt.',
    'Die Beatles gaben ihr letztes offizielles Konzert.',
    'Walt Disney starb.',
    'In Deutschland kam die erste Wirtschaftskrise nach dem Krieg.',
    'Die Sowjetunion setzte erstmals eine Sonde weich auf dem Mond ab.',
    'Der Film „Zwei glorreiche Halunken" kam ins Kino.',
    'Die Rolling Stones und die Beatles bestimmten die Charts.'
  ],
  1967: [
    'In Deutschland startete das Farbfernsehen mit einem Knopfdruck von Willy Brandt.',
    'Der erste Mensch bekam in Südafrika ein fremdes Herz eingepflanzt.',
    'Benno Ohnesorg wurde bei einer Demonstration in West-Berlin erschossen.',
    'Der „Summer of Love" prägte die Hippie-Bewegung in San Francisco.',
    'Die Beatles veröffentlichten „Sgt. Pepper\'s Lonely Hearts Club Band".',
    'Der Sechstagekrieg im Nahen Osten veränderte die Landkarte.',
    'Che Guevara wurde in Bolivien getötet.',
    'Das Musical „Hair" wurde uraufgeführt.',
    'Die Studentenbewegung formierte sich an deutschen Universitäten.',
    'Der Film „Das Dschungelbuch" kam in die Kinos.'
  ],
  1968: [
    'Martin Luther King wurde in Memphis erschossen.',
    'Auch Robert F. Kennedy fiel einem Attentat zum Opfer.',
    'Der Prager Frühling wurde von Truppen des Warschauer Pakts niedergeschlagen.',
    'Auf Rudi Dutschke wurde in West-Berlin ein Attentat verübt.',
    'Die Studentenunruhen erreichten in Paris und Deutschland ihren Höhepunkt.',
    'Die Notstandsgesetze wurden in der Bundesrepublik verabschiedet.',
    'Der Film „2001: Odyssee im Weltraum" kam ins Kino.',
    'Bei den Olympischen Spielen protestierten US-Sprinter mit erhobener Faust.',
    'Die ersten Menschen umrundeten in der Raumkapsel Apollo 8 den Mond.',
    'In Deutschland kam der VW Käfer millionenfach auf die Straßen.'
  ],
  1969: [
    'Zwei Menschen betraten erstmals den Mond.',
    'Willy Brandt wurde Bundeskanzler – der erste Sozialdemokrat in diesem Amt.',
    'Das Woodstock-Festival wurde zum Symbol einer ganzen Generation.',
    'Die Sesamstraße wurde in den USA erstmals ausgestrahlt.',
    'Die Concorde hob zu ihrem Jungfernflug ab.',
    'Gustav Heinemann wurde Bundespräsident.',
    'Der Vorläufer des Internets verband die ersten Computer an US-Universitäten.',
    'Die Beatles gaben ihr legendäres Dachkonzert in London.',
    'In der DDR wurde der Fernsehturm am Alexanderplatz gebaut.',
    'Der Jumbo-Jet Boeing 747 startete zu seinem ersten Flug.'
  ],
  1970: [
    'Willy Brandt kniete in Warschau vor dem Ehrenmal des Ghettos nieder.',
    'Brasilien gewann die Fußball-WM in Mexiko und durfte den Pokal behalten.',
    'Das „Jahrhundertspiel" zwischen Deutschland und Italien endete 3:4 nach Verlängerung.',
    'Die Beatles trennten sich.',
    'Jimi Hendrix und Janis Joplin starben im selben Jahr.',
    'Die Fernsehserie „Tatort" wurde zum ersten Mal ausgestrahlt.',
    'In den USA protestierten Studenten gegen den Vietnamkrieg, bei Kent State fielen Schüsse.',
    'Der Jumbo-Jet nahm den Linienbetrieb über den Atlantik auf.',
    'In Deutschland wurde die Fußgängerzone zum Modell für viele Innenstädte.',
    'Der erste Erdgipfel-Vorläufer machte Umweltschutz zum Thema.'
  ],
  1971: [
    'Willy Brandt erhielt den Friedensnobelpreis.',
    'Erich Honecker löste Walter Ulbricht an der Spitze der DDR ab.',
    'Der Dollar wurde vom Gold gelöst, das Weltwährungssystem geriet ins Wanken.',
    'Greenpeace wurde gegründet.',
    'In Deutschland wurde die Sendung „Der große Preis" populär.',
    'Die Schweiz führte das Frauenwahlrecht auf Bundesebene ein.',
    'Der Mikroprozessor kam auf den Markt und legte den Grundstein für den Computer zu Hause.',
    'Die Rockband Led Zeppelin veröffentlichte ihr viertes Album.',
    'Walt Disney World eröffnete in Florida.',
    'In Deutschland wurde die Volljährigkeit von 21 auf 18 Jahre gesenkt.'
  ],
  1972: [
    'Bei den Olympischen Spielen in München kam es zum Attentat auf die israelische Mannschaft.',
    'Deutschland wurde in Belgien erstmals Fußball-Europameister.',
    'Der Grundlagenvertrag regelte das Verhältnis zwischen BRD und DDR.',
    'Willy Brandt überstand ein Misstrauensvotum im Bundestag.',
    'Die letzte bemannte Mondlandung fand statt.',
    'Der Club of Rome veröffentlichte seinen Bericht über die Grenzen des Wachstums.',
    'Der erste Heimvideospiel-Automat „Pong" kam heraus.',
    'Die Sendung „Die Sendung mit der Maus" etablierte sich im Kinderfernsehen.',
    'Der Film „Der Pate" kam ins Kino.',
    'In München wurde die U-Bahn zu den Spielen ausgebaut.'
  ],
  1973: [
    'Die Ölkrise führte in Deutschland zu autofreien Sonntagen.',
    'In Chile putschte das Militär gegen Präsident Allende.',
    'Der Vietnamkrieg endete für die USA mit dem Waffenstillstandsabkommen.',
    'Beide deutsche Staaten wurden in die Vereinten Nationen aufgenommen.',
    'Pink Floyd veröffentlichten „The Dark Side of the Moon".',
    'Der Jom-Kippur-Krieg brach im Nahen Osten aus.',
    'Das World Trade Center in New York wurde eröffnet.',
    'In Deutschland wurde ein Anwerbestopp für Gastarbeiter verhängt.',
    'Die Fernsehserie „Kojak" lief erstmals im Fernsehen.',
    'Der Bau des Fernmeldeturms prägte viele deutsche Städte.'
  ],
  1974: [
    'Deutschland wurde im eigenen Land Fußball-Weltmeister.',
    'Willy Brandt trat wegen der Guillaume-Affäre zurück, Helmut Schmidt folgte ihm.',
    'US-Präsident Richard Nixon trat wegen der Watergate-Affäre zurück.',
    'ABBA gewannen den Grand Prix Eurovision mit „Waterloo".',
    'Die DDR besiegte die Bundesrepublik bei der WM in Hamburg.',
    'In Deutschland wurde die Straßenverkehrsordnung um die Promillegrenze verschärft.',
    'Der Zauberwürfel wurde erfunden.',
    'Der Film „Der weiße Hai" wurde gedreht und sollte das Kino verändern.',
    'Portugal erlebte die Nelkenrevolution.',
    'In der DDR wurde die Verfassung geändert und die deutsche Einheit gestrichen.'
  ],
  1975: [
    'Der Vietnamkrieg endete mit dem Fall von Saigon.',
    'In Spanien starb Diktator Franco, die Monarchie wurde wiederhergestellt.',
    'Die Schlussakte von Helsinki wurde von Ost und West unterzeichnet.',
    'Microsoft wurde gegründet.',
    'Der Film „Einer flog über das Kuckucksnest" kam ins Kino.',
    'Queen veröffentlichten „Bohemian Rhapsody".',
    'In Deutschland wurde der Paragraf zum Schwangerschaftsabbruch neu geregelt.',
    'Die RAF verübte den Anschlag auf die deutsche Botschaft in Stockholm.',
    'Die erste gemeinsame Raumfahrtmission von USA und Sowjetunion fand statt.',
    'Bill Gates und Paul Allen schrieben ihre erste Software für Heimcomputer.'
  ],
  1976: [
    'In China starben Mao Zedong und Zhou Enlai.',
    'Apple wurde in einer Garage gegründet.',
    'Die Concorde nahm den Linienflugbetrieb auf.',
    'Nadia Comăneci turnte bei Olympia die erste perfekte Zehn.',
    'Der Punk erreichte mit den Sex Pistols die Öffentlichkeit.',
    'In Deutschland wurde das Ehe- und Familienrecht grundlegend reformiert.',
    'Ein schweres Erdbeben erschütterte die chinesische Stadt Tangshan.',
    'Die Viking-Sonden landeten auf dem Mars.',
    'Der Film „Rocky" kam in die Kinos.',
    'In der DDR wurde Wolf Biermann ausgebürgert.'
  ],
  1977: [
    'Der Deutsche Herbst mit der Entführung von Hanns Martin Schleyer erschütterte die Bundesrepublik.',
    'Die Lufthansa-Maschine „Landshut" wurde in Mogadischu befreit.',
    'Elvis Presley starb in Memphis.',
    'Der erste „Star Wars"-Film kam ins Kino.',
    'Der Heimcomputer Apple II kam auf den Markt.',
    'Die Voyager-Sonden starteten zu ihrer Reise ins äußere Sonnensystem.',
    'In New York legte ein Stromausfall die Stadt lahm.',
    'Der Film „Saturday Night Fever" löste das Disco-Fieber aus.',
    'In Deutschland wurde die Gurtpflicht im Auto eingeführt.',
    'Der Grand Prix wurde in Deutschland zum Fernsehgroßereignis.'
  ],
  1978: [
    'Argentinien gewann die Fußball-WM im eigenen Land, Deutschland schied nach der „Schmach von Córdoba" aus.',
    'Das erste Retortenbaby der Welt wurde in England geboren.',
    'In Rom wurden innerhalb weniger Wochen zwei neue Päpste gewählt.',
    'Sigmund Jähn flog als erster Deutscher ins All.',
    'Die Sony-Ingenieure arbeiteten am tragbaren Kassettenspieler.',
    'Der Film „Grease" mit John Travolta kam in die Kinos.',
    'In Deutschland begann die Anti-Atomkraft-Bewegung Massen zu mobilisieren.',
    'Der Modelleisenbahn- und Computerspielboom erreichte deutsche Kinderzimmer.',
    'Die erste Nummer der Zeitschrift für Heimcomputer erschien in Deutschland.',
    'Ein Tankerunglück vor der Bretagne verursachte eine Ölpest.'
  ],
  1979: [
    'Im Iran stürzte die islamische Revolution den Schah.',
    'Die Sowjetunion marschierte in Afghanistan ein.',
    'Die Grünen formierten sich in Deutschland als politische Kraft.',
    'Der Reaktorunfall von Harrisburg erschütterte das Vertrauen in die Atomkraft.',
    'Margaret Thatcher wurde britische Premierministerin.',
    'Der Walkman kam auf den Markt und machte Musik mobil.',
    'Die Fernsehserie „Holocaust" bewegte Millionen Deutsche.',
    'Der NATO-Doppelbeschluss löste die Friedensbewegung aus.',
    'Der Film „Alien" kam ins Kino.',
    'Zwei Familien flohen mit einem selbstgebauten Heißluftballon aus der DDR.'
  ],
  1980: [
    'Beim Oktoberfest in München explodierte eine Bombe.',
    'John Lennon wurde in New York erschossen.',
    'Viele westliche Staaten boykottierten die Olympischen Spiele in Moskau.',
    'Deutschland wurde in Italien Fußball-Europameister.',
    'In Polen entstand die Gewerkschaft Solidarność.',
    'Der Vulkan Mount St. Helens brach in den USA aus.',
    'Der Film „Das Imperium schlägt zurück" kam ins Kino.',
    'Pac-Man eroberte die Spielhallen.',
    'Der Krieg zwischen Irak und Iran begann.',
    'In Deutschland gründete sich die Partei Die Grünen auf Bundesebene.'
  ],
  1981: [
    'Auf US-Präsident Ronald Reagan wurde ein Attentat verübt.',
    'Auch auf Papst Johannes Paul II. wurde geschossen.',
    'Die erste Raumfähre Columbia startete ins All.',
    'Der Musiksender MTV ging in den USA auf Sendung.',
    'Prinz Charles heiratete Lady Diana vor einem Millionenpublikum.',
    'IBM brachte seinen ersten Personal Computer heraus.',
    'In Polen wurde das Kriegsrecht verhängt.',
    'In Deutschland demonstrierten Hunderttausende gegen die Nachrüstung.',
    'Das Wrack der Titanic war noch unentdeckt, die Suche lief.',
    'Der Film „Jäger des verlorenen Schatzes" kam in die Kinos.'
  ],
  1982: [
    'Helmut Kohl wurde durch ein konstruktives Misstrauensvotum Bundeskanzler.',
    'Der Falklandkrieg zwischen Großbritannien und Argentinien brach aus.',
    'Italien wurde in Spanien Fußball-Weltmeister.',
    'Michael Jackson veröffentlichte das Album „Thriller".',
    'Die Compact Disc kam auf den Markt.',
    'Der Film „E.T. – Der Außerirdische" wurde zum Kinoerfolg.',
    'Die Neue Deutsche Welle beherrschte die deutschen Charts.',
    'Das Nichtangriffs-Spiel von Gijón bei der WM sorgte für Empörung.',
    'In Deutschland wurde der Commodore 64 zum Verkaufsschlager.',
    'Ein Waldsterben-Bericht alarmierte die Öffentlichkeit.'
  ],
  1983: [
    'Die Grünen zogen erstmals in den Bundestag ein.',
    'Der Stern veröffentlichte die gefälschten Hitler-Tagebücher.',
    'Die ersten Mobiltelefone kamen in den USA auf den Markt.',
    'Nena landete mit „99 Luftballons" einen Welthit.',
    'In Deutschland demonstrierten Hunderttausende gegen die Stationierung von Raketen.',
    'Der Film „Die Rückkehr der Jedi-Ritter" kam ins Kino.',
    'Das erste Handy wog fast ein Kilogramm und kostete ein Vermögen.',
    'Der HI-Virus wurde als Ursache von AIDS identifiziert.',
    'Sally Ride flog als erste Amerikanerin ins All.',
    'Die Volkszählung in Deutschland wurde nach Protesten gestoppt.'
  ],
  1984: [
    'In Deutschland startete das Privatfernsehen.',
    'Die Olympischen Spiele in Los Angeles wurden vom Ostblock boykottiert.',
    'Apple stellte den Macintosh mit einem legendären Werbespot vor.',
    'Band Aid nahm „Do They Know It\'s Christmas?" für Äthiopien auf.',
    'Bei einem Chemieunfall in Bhopal starben Tausende Menschen.',
    'Indiens Premierministerin Indira Gandhi wurde ermordet.',
    'Der Film „Ghostbusters" wurde zum Kinohit.',
    'Richard von Weizsäcker wurde Bundespräsident.',
    'In Deutschland wurde das Kabelfernsehen ausgebaut.',
    'Der Tetris-Klassiker wurde in der Sowjetunion programmiert.'
  ],
  1985: [
    'Michail Gorbatschow übernahm die Führung der Sowjetunion.',
    'Das Live-Aid-Konzert wurde weltweit übertragen.',
    'Boris Becker gewann als jüngster Spieler das Tennisturnier von Wimbledon.',
    'Das Wrack der Titanic wurde im Atlantik gefunden.',
    'Bei der Katastrophe im Brüsseler Heysel-Stadion starben Fußballfans.',
    'Der Film „Zurück in die Zukunft" kam ins Kino.',
    'Coca-Cola änderte sein Rezept und musste zurückrudern.',
    'Das Ozonloch über der Antarktis wurde entdeckt.',
    'In Deutschland wurde der Glykolwein-Skandal aufgedeckt.',
    'Nintendo brachte seine Heimkonsole nach Nordamerika.'
  ],
  1986: [
    'Der Reaktor von Tschernobyl explodierte, die Wolke zog auch über Deutschland.',
    'Die Raumfähre Challenger explodierte kurz nach dem Start.',
    'Argentinien wurde Weltmeister, Maradonas „Hand Gottes" ging in die Geschichte ein.',
    'Ein Chemieunfall bei Basel verseuchte den Rhein.',
    'In Deutschland wurde das Umweltministerium gegründet.',
    'Der Film „Top Gun" kam in die Kinos.',
    'Steffi Graf gewann ihre ersten großen Tennisturniere.',
    'Halley\'s Komet war mit bloßem Auge zu sehen.',
    'In Schweden wurde Ministerpräsident Olof Palme erschossen.',
    'Die Fernsehserie „Alf" startete in den USA.'
  ],
  1987: [
    'Mathias Rust landete mit einem Sportflugzeug auf dem Roten Platz in Moskau.',
    'Erich Honecker besuchte als erster DDR-Staatschef die Bundesrepublik.',
    'Ronald Reagan forderte in Berlin: „Tear down this wall".',
    'Steffi Graf wurde erstmals die Nummer eins der Tennis-Weltrangliste.',
    'Der Börsencrash am Schwarzen Montag erschütterte die Märkte.',
    'Die USA und die Sowjetunion vereinbarten die Abrüstung von Mittelstreckenraketen.',
    'Der Film „Dirty Dancing" wurde zum Überraschungserfolg.',
    'In Deutschland wurde die Volkszählung nachgeholt und heftig diskutiert.',
    'Michael Jackson veröffentlichte das Album „Bad".',
    'Die Simpsons erschienen erstmals als kurze Zeichentrickfilme.'
  ],
  1988: [
    'Die Fußball-Europameisterschaft fand in Deutschland statt, die Niederlande gewannen.',
    'Bei der Flugschau in Ramstein stürzten Jets in die Zuschauer.',
    'Steffi Graf gewann alle vier großen Tennisturniere und dazu Olympiagold.',
    'Ein Terroranschlag ließ ein Flugzeug über dem schottischen Lockerbie abstürzen.',
    'Franz Josef Strauß starb.',
    'Der Film „Rain Man" kam ins Kino.',
    'In der Sowjetunion nahmen Glasnost und Perestroika Fahrt auf.',
    'Ein Erdbeben in Armenien forderte Zehntausende Todesopfer.',
    'Das Geiseldrama von Gladbeck wurde live im Fernsehen übertragen.',
    'Der Computer-Wurm legte erstmals Teile des frühen Internets lahm.'
  ],
  1989: [
    'Die Berliner Mauer fiel.',
    'In Ungarn wurde der Eiserne Vorhang geöffnet, Tausende DDR-Bürger flohen.',
    'Auf dem Platz des Himmlischen Friedens in Peking wurde die Demokratiebewegung niedergeschlagen.',
    'Montagsdemonstrationen in Leipzig brachten Hunderttausende auf die Straße.',
    'Erich Honecker trat als Staatschef der DDR zurück.',
    'Das World Wide Web wurde am Kernforschungszentrum CERN erdacht.',
    'Der Öltanker Exxon Valdez verursachte vor Alaska eine Ölkatastrophe.',
    'In Rumänien wurde das Regime Ceaușescus gestürzt.',
    'Der Film „Der Club der toten Dichter" kam in die Kinos.',
    'Der Game Boy kam auf den Markt.'
  ],
  1990: [
    'Deutschland wurde wiedervereinigt.',
    'Deutschland wurde in Italien Fußball-Weltmeister.',
    'Nelson Mandela kam in Südafrika nach 27 Jahren frei.',
    'Der Irak überfiel Kuwait, der Golfkrieg bahnte sich an.',
    'Die D-Mark wurde in der DDR eingeführt.',
    'Das Hubble-Weltraumteleskop wurde ins All gebracht.',
    'Die drei Tenöre sangen erstmals gemeinsam beim WM-Konzert.',
    'In Deutschland gab es die ersten gesamtdeutschen Bundestagswahlen.',
    'Der Film „Kevin – Allein zu Haus" kam in die Kinos.',
    'Die Sowjetunion stand kurz vor dem Zerfall.'
  ],
  1991: [
    'Die Sowjetunion löste sich auf.',
    'Der Golfkrieg gegen den Irak wurde geführt.',
    'In Jugoslawien begann der Zerfall des Staates.',
    'Der Bundestag beschloss, Berlin wieder zur Hauptstadt zu machen.',
    'Nirvana veröffentlichten „Smells Like Teen Spirit" und lösten den Grunge aus.',
    'Freddie Mercury starb.',
    'Das World Wide Web wurde öffentlich zugänglich gemacht.',
    'Die Treuhandanstalt privatisierte die DDR-Betriebe.',
    'Der Film „Terminator 2" kam ins Kino.',
    'Der ICE nahm in Deutschland den Betrieb auf.'
  ],
  1992: [
    'Der Vertrag von Maastricht begründete die Europäische Union.',
    'Dänemark wurde überraschend Fußball-Europameister.',
    'In Rostock-Lichtenhagen kam es zu schweren fremdenfeindlichen Ausschreitungen.',
    'Der Krieg in Bosnien brach aus.',
    'Bill Clinton gewann die US-Präsidentschaftswahl.',
    'Die Olympischen Spiele in Barcelona machten das „Dream Team" berühmt.',
    'In Deutschland wurde die erste SMS verschickt – die Technik war neu.',
    'Der Film „Bodyguard" mit Whitney Houston kam in die Kinos.',
    'Windows 3.1 kam auf den Markt.',
    'Der Erdgipfel von Rio stellte den Klimaschutz auf die Tagesordnung.'
  ],
  1993: [
    'In Deutschland wurden die fünfstelligen Postleitzahlen eingeführt.',
    'Der Brandanschlag von Solingen erschütterte das Land.',
    'Die Europäische Union trat offiziell in Kraft.',
    'Die Bahnreform machte aus der Bundesbahn die Deutsche Bahn AG.',
    'Der Film „Jurassic Park" begeisterte mit Computertricks.',
    'Das Asylrecht wurde in Deutschland grundlegend geändert.',
    'Der Weltraumteleskop-Spiegel von Hubble wurde im All repariert.',
    'In Tschechien und der Slowakei trennten sich die beiden Landesteile friedlich.',
    'Der Grand Prix wurde in Irland gewonnen und in Deutschland viel gesehen.',
    'Die Sendung „Wetten, dass..?" war Straßenfeger im Samstagabendprogramm.'
  ],
  1994: [
    'In Südafrika wurde Nelson Mandela zum Präsidenten gewählt.',
    'In Ruanda kam es zum Völkermord.',
    'Der Kanaltunnel zwischen England und Frankreich wurde eröffnet.',
    'Ayrton Senna verunglückte in Imola tödlich.',
    'Brasilien gewann die Fußball-WM in den USA.',
    'Der Film „Forrest Gump" gewann später mehrere Oscars.',
    'Die letzten russischen Truppen verließen Deutschland.',
    'Kurt Cobain starb.',
    'Der Sender ProSieben und die Privaten kämpften um Quoten.',
    'In Deutschland startete die erste Internet-Einwahl für Privatleute.'
  ],
  1995: [
    'Der Reichstag in Berlin wurde von Christo verhüllt.',
    'Windows 95 kam mit großem Werbeaufwand auf den Markt.',
    'Das Massaker von Srebrenica erschütterte Europa.',
    'Der Giftgasanschlag in der U-Bahn von Tokio machte Schlagzeilen.',
    'Israels Ministerpräsident Rabin wurde ermordet.',
    'Das Schengener Abkommen trat in Kraft und ließ Grenzkontrollen wegfallen.',
    'Der Film „Toy Story" war der erste komplett am Computer erzeugte Kinofilm.',
    'Der Bosnienkrieg endete mit dem Abkommen von Dayton.',
    'Michael Schumacher wurde zum zweiten Mal Formel-1-Weltmeister.',
    'Amazon und eBay nahmen ihren Betrieb auf.'
  ],
  1996: [
    'Deutschland wurde in England Fußball-Europameister.',
    'Das Klonschaf Dolly wurde geboren.',
    'Die Olympischen Spiele in Atlanta wurden von einem Bombenanschlag überschattet.',
    'In Deutschland wurde die Rechtschreibreform beschlossen.',
    'Der Film „Independence Day" füllte die Kinos.',
    'Die Spice Girls landeten ihren ersten Nummer-eins-Hit.',
    'Die Telekom ging an die Börse, die „Volksaktie" wurde beworben.',
    'Ein Großbrand zerstörte Teile des Düsseldorfer Flughafens.',
    'Der Nintendo 64 kam auf den Markt.',
    'In Afghanistan übernahmen die Taliban die Macht.'
  ],
  1997: [
    'Prinzessin Diana starb bei einem Autounfall in Paris.',
    'Der Film „Titanic" wurde zum erfolgreichsten Kinofilm seiner Zeit.',
    'Hongkong wurde an China zurückgegeben.',
    'Mutter Teresa starb.',
    'Der Schachcomputer Deep Blue besiegte den Weltmeister Garri Kasparow.',
    'Die Mars-Sonde Pathfinder setzte ein Fahrzeug auf dem roten Planeten ab.',
    'Das Kyoto-Protokoll zum Klimaschutz wurde beschlossen.',
    'In Deutschland ging der Nachrichtensender n-tv auf Sendung.',
    'Der Erfolg von „Men in Black" prägte den Kinosommer.',
    'Das Fernsehformat „Big Brother" war noch nicht erfunden, Talkshows boomten.'
  ],
  1998: [
    'Gerhard Schröder löste Helmut Kohl als Bundeskanzler ab.',
    'Frankreich wurde im eigenen Land Fußball-Weltmeister.',
    'Google wurde gegründet.',
    'Der Euro wurde als Buchgeld beschlossen, die Kurse standen fest.',
    'Ein ICE entgleiste bei Eschede, es gab viele Tote.',
    'Viagra kam auf den Markt.',
    'Die Raumstation ISS wurde mit dem ersten Modul begonnen.',
    'Der Film „Titanic" räumte bei den Oscars ab.',
    'In Deutschland fiel das Postmonopol.',
    'Die Boygroups und Girlgroups beherrschten die Charts.'
  ],
  1999: [
    'Der Kosovokrieg führte zum ersten Kampfeinsatz der Bundeswehr.',
    'Die Sorge vor dem Jahr-2000-Computerproblem beherrschte die Schlagzeilen.',
    'Der Euro wurde als Buchwährung eingeführt.',
    'Eine totale Sonnenfinsternis war in Süddeutschland zu sehen.',
    'Die Musiktauschbörse Napster startete.',
    'Der Film „Matrix" veränderte die Actionfilme.',
    'Die Regierung zog von Bonn nach Berlin um.',
    'Der Bau der Elbphilharmonie war noch nicht begonnen, Hamburg plante den Hafenumbau.',
    'Die Sendung „Wer wird Millionär?" startete in Deutschland.',
    'Britney Spears und Backstreet Boys dominierten den Pop.'
  ],
  2000: [
    'Die Weltausstellung Expo fand in Hannover statt.',
    'Frankreich wurde Fußball-Europameister.',
    'Die Olympischen Spiele fanden in Sydney statt.',
    'Die Concorde stürzte bei Paris ab.',
    'Die Dotcom-Blase an den Börsen platzte.',
    'Der Börsengang der Telekom-Aktie endete für viele im Verlust.',
    'In Deutschland startete „Big Brother" im Fernsehen.',
    'Der Atomausstieg wurde zwischen Regierung und Energiewirtschaft vereinbart.',
    'George W. Bush gewann die US-Wahl nach einem Auszählungsstreit in Florida.',
    'Der Film „Gladiator" kam ins Kino.'
  ],
  2001: [
    'Die Anschläge auf das World Trade Center erschütterten die Welt.',
    'Der Krieg in Afghanistan begann.',
    'Wikipedia ging online.',
    'Apple stellte den ersten iPod vor.',
    'Der erste „Harry Potter"-Film kam in die Kinos.',
    'Auch der erste Teil von „Der Herr der Ringe" startete im Kino.',
    'In den Niederlanden wurde die gleichgeschlechtliche Ehe eingeführt.',
    'Die Raumstation Mir verglühte kontrolliert über dem Pazifik.',
    'Windows XP kam auf den Markt.',
    'In Deutschland brach die BSE-Krise über die Landwirtschaft herein.'
  ],
  2002: [
    'Das Euro-Bargeld kam in Umlauf, die D-Mark verschwand.',
    'Brasilien wurde Fußball-Weltmeister, Deutschland verlor das Finale.',
    'Der Amoklauf am Gutenberg-Gymnasium in Erfurt erschütterte Deutschland.',
    'Ein Jahrhunderthochwasser an der Elbe richtete schwere Schäden an.',
    'Der Film „Spider-Man" startete die moderne Superheldenwelle.',
    'Die Fußball-WM fand erstmals in Asien statt.',
    'In Deutschland wurden die Hartz-Reformen vorbereitet.',
    'Die Raumsonde Mars Odyssey fand Hinweise auf Wassereis.',
    'Der Prozess gegen Slobodan Milošević begann in Den Haag.',
    'Die ersten Flachbildfernseher kamen in die Wohnzimmer.'
  ],
  2003: [
    'Der Irakkrieg begann, Deutschland beteiligte sich nicht.',
    'Die Raumfähre Columbia verglühte beim Wiedereintritt.',
    'Die Lungenkrankheit SARS versetzte Asien in Alarm.',
    'Ein Jahrhundertsommer mit Rekordhitze traf Europa.',
    'Die Agenda 2010 wurde von Gerhard Schröder verkündet.',
    'Der Musikdienst iTunes Store startete.',
    'Der letzte Teil von „Der Herr der Ringe" kam ins Kino.',
    'Der Toll-Collect-Start für die Lkw-Maut scheiterte zunächst.',
    'Die Raumsonde Mars Express startete Richtung Mars.',
    'In Deutschland wurde die Dosenpfand-Pflicht eingeführt.'
  ],
  2004: [
    'Ein Tsunami im Indischen Ozean forderte Hunderttausende Todesopfer.',
    'Griechenland wurde überraschend Fußball-Europameister.',
    'Die EU nahm zehn neue Mitgliedstaaten auf.',
    'Facebook wurde gegründet.',
    'Die Olympischen Spiele kehrten nach Athen zurück.',
    'Die Hartz-IV-Reform löste Montagsdemonstrationen aus.',
    'Der Film „Der Untergang" über Hitlers letzte Tage kam ins Kino.',
    'Die Marsrover Spirit und Opportunity landeten auf dem Mars.',
    'Der Terroranschlag auf Madrider Vorortzüge erschütterte Spanien.',
    'In Deutschland startete die Sendung „Deutschland sucht den Superstar" in ihre zweite Runde.'
  ],
  2005: [
    'Angela Merkel wurde erste Bundeskanzlerin Deutschlands.',
    'Papst Johannes Paul II. starb, Joseph Ratzinger wurde als Benedikt XVI. sein Nachfolger.',
    'Der Hurrikan Katrina verwüstete New Orleans.',
    'YouTube wurde gegründet.',
    'Der Airbus A380 hob zu seinem Erstflug ab.',
    'Das Holocaust-Mahnmal in Berlin wurde eingeweiht.',
    'Terroranschläge trafen die Londoner U-Bahn.',
    'In Deutschland wurde über die Fußball-WM im eigenen Land gefiebert.',
    'Der Film „Die Chroniken von Narnia" kam ins Kino.',
    'Das Kyoto-Protokoll trat in Kraft.'
  ],
  2006: [
    'Die Fußball-WM in Deutschland wurde zum „Sommermärchen".',
    'Italien wurde Weltmeister, Zidane bekam im Finale die Rote Karte.',
    'Twitter startete.',
    'Pluto verlor seinen Status als Planet.',
    'In Deutschland trat die Föderalismusreform in Kraft.',
    'Der Film „Der Teufel trägt Prada" kam in die Kinos.',
    'Die Nintendo Wii und die PlayStation 3 kamen auf den Markt.',
    'Ein Stromausfall legte Teile Europas lahm.',
    'Saddam Hussein wurde im Irak hingerichtet.',
    'Die deutsche Fußballnationalmannschaft wurde Dritter im eigenen Land.'
  ],
  2007: [
    'Apple stellte das erste iPhone vor.',
    'Die Finanzkrise begann mit dem Zusammenbruch des US-Hypothekenmarkts.',
    'In Deutschland wurde das Rauchverbot in Gaststätten schrittweise eingeführt.',
    'Der G8-Gipfel in Heiligendamm zog Massenproteste an.',
    'Der letzte „Harry Potter"-Roman erschien.',
    'Rumänien und Bulgarien traten der EU bei.',
    'Der Film „Das Bourne Ultimatum" kam ins Kino.',
    'Der Klimabericht des Weltklimarats sorgte für Aufsehen.',
    'In Deutschland stieg die Mehrwertsteuer auf 19 Prozent.',
    'Die Sendung „Germany\'s Next Topmodel" etablierte sich im Fernsehen.'
  ],
  2008: [
    'Die Investmentbank Lehman Brothers ging pleite, die Finanzkrise eskalierte.',
    'Barack Obama wurde zum US-Präsidenten gewählt.',
    'Die Olympischen Spiele fanden in Peking statt.',
    'Spanien wurde Fußball-Europameister.',
    'Der erste Android-Smartphone kam auf den Markt.',
    'Der Film „The Dark Knight" mit Heath Ledger kam ins Kino.',
    'In Deutschland wurde die Abwrackprämie vorbereitet.',
    'Die Raumsonde Phoenix landete am Nordpol des Mars.',
    'Der Bitcoin wurde als Idee veröffentlicht.',
    'Die Deutsche Bahn plante ihren Börsengang, der dann abgesagt wurde.'
  ],
  2009: [
    'Die Wirtschaftskrise erreichte Deutschland, die Abwrackprämie wurde eingeführt.',
    'Michael Jackson starb.',
    'Die Schweinegrippe löste eine weltweite Impfkampagne aus.',
    'Ein Flugzeug landete nach Vogelschlag auf dem Hudson River in New York.',
    'Der Amoklauf von Winnenden erschütterte Deutschland.',
    'WhatsApp wurde gegründet.',
    'Der Film „Avatar" setzte neue Maßstäbe im 3D-Kino.',
    'Barack Obama erhielt den Friedensnobelpreis.',
    'In Deutschland wurde zwanzig Jahre Mauerfall gefeiert.',
    'Der Bundestag beschloss die Schuldenbremse im Grundgesetz.'
  ],
  2010: [
    'Spanien wurde in Südafrika Fußball-Weltmeister.',
    'Bei der Loveparade in Duisburg starben Menschen in einer Massenpanik.',
    'Die Ölplattform Deepwater Horizon explodierte im Golf von Mexiko.',
    'Ein Vulkanausbruch auf Island legte den europäischen Flugverkehr lahm.',
    'Apple stellte das erste iPad vor.',
    'Instagram startete.',
    'Griechenland brauchte das erste Rettungspaket der Eurozone.',
    'Der Protest gegen Stuttgart 21 erreichte seinen Höhepunkt.',
    'In Chile wurden 33 verschüttete Bergleute gerettet.',
    'Der Film „Inception" kam ins Kino.'
  ],
  2011: [
    'Das Erdbeben und der Tsunami in Japan führten zur Reaktorkatastrophe von Fukushima.',
    'Deutschland beschloss den Atomausstieg bis 2022.',
    'Osama bin Laden wurde in Pakistan getötet.',
    'Der Arabische Frühling erfasste mehrere Länder.',
    'Die Wehrpflicht in Deutschland wurde ausgesetzt.',
    'Guttenberg trat wegen seiner Doktorarbeit als Minister zurück.',
    'Steve Jobs starb.',
    'Der letzte „Harry Potter"-Film kam in die Kinos.',
    'Die Frauenfußball-WM fand in Deutschland statt.',
    'Der EHEC-Ausbruch verunsicherte die Verbraucher.'
  ],
  2012: [
    'Die Olympischen Spiele fanden in London statt.',
    'Der Song „Gangnam Style" wurde zum weltweiten Internetphänomen.',
    'Felix Baumgartner sprang aus der Stratosphäre zur Erde.',
    'Am CERN wurde das Higgs-Teilchen nachgewiesen.',
    'Der Marsrover Curiosity landete auf dem roten Planeten.',
    'Bundespräsident Christian Wulff trat zurück, Joachim Gauck folgte ihm.',
    'Das Kreuzfahrtschiff Costa Concordia havarierte vor Italien.',
    'Spanien wurde erneut Fußball-Europameister.',
    'Der Film „Ziemlich beste Freunde" wurde in Deutschland zum Überraschungserfolg.',
    'Die Eurokrise bestimmte die Schlagzeilen.'
  ],
  2013: [
    'Papst Benedikt XVI. trat zurück, Franziskus wurde gewählt.',
    'Edward Snowden enthüllte die Überwachungspraxis der Geheimdienste.',
    'Ein Bombenanschlag traf den Boston-Marathon.',
    'Die Bundestagswahl brachte die große Koalition zurück.',
    'Nelson Mandela starb.',
    'Der FC Bayern gewann als erster deutscher Club das Triple.',
    'Ein Hochwasser an Elbe und Donau überflutete ganze Städte.',
    'Der Film „Die Eiskönigin" wurde zum weltweiten Kinderhit.',
    'Ein Meteorit explodierte über der russischen Stadt Tscheljabinsk.',
    'Die Sendung „Breaking Bad" endete und wurde zum Kult.'
  ],
  2014: [
    'Deutschland wurde in Brasilien Fußball-Weltmeister, das Halbfinale endete 7:1.',
    'Miroslav Klose beendete nach der WM seine Karriere in der Nationalmannschaft.',
    'Russland annektierte die Krim, der Konflikt in der Ukraine begann.',
    'Die Raumsonde Rosetta setzte ein Landegerät auf einem Kometen ab.',
    'Die Ice Bucket Challenge ging um die Welt.',
    'Die Ebola-Epidemie breitete sich in Westafrika aus.',
    'Ein Flugzeug der Malaysia Airlines verschwand spurlos.',
    'Der Terror der Miliz IS erschütterte Syrien und den Irak.',
    'Der Film „Guardians of the Galaxy" kam ins Kino.',
    'Deutschland feierte 25 Jahre Mauerfall.'
  ],
  2015: [
    'Die Flüchtlingsbewegung nach Europa erreichte ihren Höhepunkt.',
    'Der Anschlag auf die Redaktion von Charlie Hebdo erschütterte Frankreich.',
    'Bei den Anschlägen von Paris starben viele Menschen im Bataclan.',
    'Der Abgasskandal bei Volkswagen wurde aufgedeckt.',
    'Das Pariser Klimaabkommen wurde beschlossen.',
    'Eine Germanwings-Maschine wurde absichtlich zum Absturz gebracht.',
    'Die Raumsonde New Horizons flog am Pluto vorbei.',
    'Der Film „Star Wars: Das Erwachen der Macht" brach Rekorde.',
    'Griechenland stimmte in einem Referendum über die Sparauflagen ab.',
    'Angela Merkels Satz „Wir schaffen das" prägte die Debatte.'
  ],
  2016: [
    'Großbritannien stimmte für den Austritt aus der EU.',
    'Donald Trump gewann die US-Präsidentschaftswahl.',
    'Portugal wurde Fußball-Europameister.',
    'Die Olympischen Spiele fanden in Rio de Janeiro statt.',
    'David Bowie und Prince starben.',
    'Ein Lastwagen raste auf den Weihnachtsmarkt am Berliner Breitscheidplatz.',
    'Das Spiel Pokémon Go trieb Millionen auf die Straße.',
    'Die Fußball-EM fand in Frankreich statt und wurde von Sicherheitsfragen begleitet.',
    'Bob Dylan erhielt den Literaturnobelpreis.',
    'Ein Anschlag traf den Nationalfeiertag in Nizza.'
  ],
  2017: [
    'Die Ehe für alle wurde in Deutschland beschlossen.',
    'Die MeToo-Debatte begann und erfasste die Filmbranche.',
    'Der G20-Gipfel in Hamburg wurde von schweren Krawallen begleitet.',
    'Helmut Kohl starb.',
    'Emmanuel Macron wurde französischer Präsident.',
    'Der Anschlag auf ein Konzert in Manchester traf viele junge Fans.',
    'Ein Hurrikan verwüstete Puerto Rico.',
    'Die Bundestagswahl brachte erstmals die AfD in großer Zahl ins Parlament.',
    'Der Film „Es" nach Stephen King wurde ein Kinoerfolg.',
    'Die Kryptowährung Bitcoin erlebte einen spektakulären Höhenflug.'
  ],
  2018: [
    'Frankreich wurde in Russland Fußball-Weltmeister, Deutschland schied in der Vorrunde aus.',
    'In Thailand wurde eine Jugendfußballmannschaft aus einer Höhle gerettet.',
    'Die Datenschutz-Grundverordnung trat in Kraft.',
    'Prinz Harry heiratete Meghan Markle.',
    'Stephen Hawking starb.',
    'Ein Dürresommer setzte der deutschen Landwirtschaft zu.',
    'Der Diesel-Skandal führte zu Fahrverboten in Innenstädten.',
    'Der Film „Black Panther" wurde zum Kulturereignis.',
    'Die Rettung im Fußball blieb aus: Löw blieb trotz WM-Aus im Amt.',
    'Angela Merkel kündigte den Rückzug vom Parteivorsitz an.'
  ],
  2019: [
    'Die Kathedrale Notre-Dame in Paris brannte.',
    'Fridays for Future und Greta Thunberg prägten die Klimadebatte.',
    'Das erste Bild eines Schwarzen Lochs wurde veröffentlicht.',
    'In Deutschland wurde 30 Jahre Mauerfall gefeiert.',
    'Der Film „Avengers: Endgame" wurde zum erfolgreichsten Kinofilm.',
    'Boris Johnson wurde britischer Premierminister.',
    'Das Klimapaket der Bundesregierung wurde beschlossen.',
    'Die Serie „Game of Thrones" endete nach acht Staffeln.',
    'Ein Anschlag auf die Synagoge in Halle erschütterte Deutschland.',
    'Die ersten Meldungen über eine neue Lungenkrankheit kamen aus China.'
  ],
  2020: [
    'Die Corona-Pandemie legte weltweit das öffentliche Leben lahm.',
    'In Deutschland gab es den ersten Lockdown mit Kontaktbeschränkungen.',
    'Die Olympischen Spiele in Tokio wurden verschoben.',
    'Großbritannien verließ endgültig die Europäische Union.',
    'Joe Biden gewann die US-Präsidentschaftswahl.',
    'Der Tod von George Floyd löste weltweite Proteste aus.',
    'Der Anschlag von Hanau erschütterte Deutschland.',
    'Die ersten Corona-Impfstoffe wurden zugelassen.',
    'Homeoffice und Videokonferenzen wurden über Nacht zum Alltag.',
    'Maradona starb.'
  ],
  2021: [
    'Die Impfkampagne gegen Corona lief in Deutschland an.',
    'Die Flutkatastrophe im Ahrtal forderte viele Todesopfer.',
    'Olaf Scholz wurde Bundeskanzler, die Ampelkoalition begann.',
    'Angela Merkel verabschiedete sich nach sechzehn Jahren aus dem Kanzleramt.',
    'Der Sturm auf das Kapitol in Washington schockierte die Welt.',
    'Ein Frachter blockierte tagelang den Suezkanal.',
    'Die Taliban übernahmen erneut die Macht in Afghanistan.',
    'Die verschobenen Olympischen Spiele fanden ohne Zuschauer statt.',
    'Italien gewann die Fußball-Europameisterschaft im Elfmeterschießen.',
    'Erste Milliardäre flogen als Touristen ins All.'
  ],
  2022: [
    'Russland überfiel die Ukraine.',
    'Argentinien wurde in Katar Fußball-Weltmeister.',
    'Königin Elizabeth II. starb nach siebzig Jahren auf dem Thron.',
    'Das 9-Euro-Ticket machte in Deutschland Furore.',
    'Die Energiekrise ließ Gas- und Strompreise explodieren.',
    'Die Gaspipelines in der Ostsee wurden gesprengt.',
    'ChatGPT wurde veröffentlicht und löste einen KI-Boom aus.',
    'Das James-Webb-Teleskop lieferte seine ersten Bilder.',
    'Elon Musk übernahm Twitter.',
    'Deutschland beschloss ein Sondervermögen für die Bundeswehr.'
  ],
  2023: [
    'Ein schweres Erdbeben in der Türkei und Syrien forderte Zehntausende Todesopfer.',
    'Künstliche Intelligenz wurde zum beherrschenden Technikthema.',
    'In Deutschland gingen die letzten Atomkraftwerke vom Netz.',
    'Das Deutschlandticket für 49 Euro wurde eingeführt.',
    'Der Angriff der Hamas auf Israel löste einen neuen Krieg aus.',
    'Ein Tauchboot verunglückte auf dem Weg zum Wrack der Titanic.',
    'Die Filme „Barbie" und „Oppenheimer" starteten am selben Tag.',
    'Der FC Bayern gewann die Meisterschaft in letzter Sekunde.',
    'Schweden und Finnland strebten in die NATO.',
    'Die Fußball-WM der Frauen fand in Australien und Neuseeland statt.'
  ],
  2024: [
    'Die Fußball-Europameisterschaft fand in Deutschland statt, Spanien gewann.',
    'Die Olympischen Spiele wurden in Paris ausgetragen.',
    'Donald Trump gewann erneut die US-Präsidentschaftswahl.',
    'Auf Donald Trump wurde bei einer Wahlkampfveranstaltung geschossen.',
    'Die Ampelkoalition in Deutschland zerbrach.',
    'Cannabis wurde in Deutschland teilweise legalisiert.',
    'Toni Kroos beendete nach der EM seine Karriere.',
    'Eine totale Sonnenfinsternis war in Nordamerika zu sehen.',
    'Die Raumkapsel Starliner brachte Astronauten zur ISS und ließ sie dort zurück.',
    'Taylor Swifts Welttournee füllte auch in Deutschland die Stadien.'
  ],
  2025: [
    'In Deutschland wurde vorgezogen ein neuer Bundestag gewählt.',
    'Friedrich Merz wurde Bundeskanzler.',
    'Papst Franziskus starb, mit Leo XIV. wurde sein Nachfolger gewählt.',
    'Donald Trump trat seine zweite Amtszeit an und verhängte weitreichende Zölle.',
    'Künstliche Intelligenz hielt in immer mehr Berufe Einzug.',
    'Die Fußball-Klub-Weltmeisterschaft wurde erstmals im neuen Format ausgetragen.',
    'Deutschland beschloss milliardenschwere Investitionen in Infrastruktur und Verteidigung.',
    'Der Krieg in der Ukraine dauerte weiter an.',
    'Das Deutschlandticket wurde teurer.',
    'Elektroautos und Wärmepumpen prägten die Debatte über den Klimaschutz.'
  ]
};


/* ------------------------------------------------------------
   Alle Hinweise zu einem Jahr zusammenstellen
   ------------------------------------------------------------ */
function hintsForYear(year) {
  var y = parseInt(year, 10);
  if (!isFinite(y)) return [];
  var out = [];
  function add(t) { if (t && out.indexOf(t) === -1) out.push(t); }

  HINT_KANZLER.forEach(function (r) {
    if (y >= r[0] && y <= r[1]) add('Der Bundeskanzler hieß ' + r[2] + '.');
  });
  HINT_US.forEach(function (r) {
    if (y >= r[0] && y <= r[1]) add('Der US-Präsident hieß ' + r[2] + '.');
  });

  if (HINT_WM[y]) {
    add('Die Fußball-Weltmeisterschaft fand in ' + HINT_WM[y][0] + ' statt, Weltmeister wurde ' + HINT_WM[y][1] + '.');
  } else {
    var letzte = null;
    Object.keys(HINT_WM).forEach(function (k) {
      var n = parseInt(k, 10);
      if (n < y && (letzte === null || n > letzte)) letzte = n;
    });
    if (letzte !== null && y - letzte <= 3) {
      add('Amtierender Fußball-Weltmeister war ' + HINT_WM[letzte][1] + '.');
    }
  }

  if (HINT_OLYMPIA[y]) add('Die Olympischen Sommerspiele fanden in ' + HINT_OLYMPIA[y] + ' statt.');

  HINT_BPRAES.forEach(function (r) { if (y >= r[0] && y <= r[1]) add('Bundespräsident war ' + r[2] + '.'); });
  HINT_DDR.forEach(function (r) { if (y >= r[0] && y <= r[1]) add('An der Spitze der DDR stand ' + r[2] + '.'); });
  HINT_PAPST.forEach(function (r) { if (y >= r[0] && y <= r[1]) add('Der Papst hieß ' + r[2] + (/\.$/.test(r[2]) ? '' : '.')); });
  HINT_UK.forEach(function (r) { if (y >= r[0] && y <= r[1]) add('In Großbritannien regierte ' + r[2] + '.'); });

  if (HINT_EM[y]) {
    add('Die Fußball-Europameisterschaft fand in ' + HINT_EM[y][0] + ' statt, Europameister wurde ' + HINT_EM[y][1] + '.');
  } else {
    var letzteEm = null;
    Object.keys(HINT_EM).forEach(function (k) {
      var n = parseInt(k, 10);
      if (n < y && (letzteEm === null || n > letzteEm)) letzteEm = n;
    });
    if (letzteEm !== null && y - letzteEm <= 3) {
      add('Amtierender Fußball-Europameister war ' + HINT_EM[letzteEm][1] + '.');
    }
  }
  if (HINT_WINTER[y]) add('Die Olympischen Winterspiele fanden in ' + HINT_WINTER[y] + ' statt.');

  HINT_EPOCHEN.forEach(function (r) { if (y >= r[0] && y <= r[1]) add(r[2]); });
  HINT_EPOCHEN2.forEach(function (r) { if (y >= r[0] && y <= r[1]) add(r[2]); });
  (HINT_EREIGNISSE[y] || []).forEach(add);

  /* Sicherheitsnetz: nichts durchlassen, worin die Jahreszahl steht */
  var jahr = String(y);
  return out.filter(function (t) { return t.indexOf(jahr) === -1; });
}
