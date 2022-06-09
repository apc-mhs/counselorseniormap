console.log('FetchS');
var map, popup, Popup, markers = [];
const elements = {
    map: document.getElementById('map'),
    submitDestination: {
        submitLink: document.getElementById('submit-destination'),
        submitYear: document.getElementById('submit-destination-year')
    },
    options: {
        year: document.getElementById('option-year'),
        pan: document.getElementById('option-pan'),
        precedence: document.getElementById('option-precedence'),
    }
}

// Page state settings
var today = new Date();
// The yearActivationMonth determines the month that a specific year becomes
// the default in the selectYear dropdown. Currently, 2 (March 15th) is used
var yearActivationMonth = 2;
var currentYear = new Date(
    today.getFullYear(),
    today.getMonth() - yearActivationMonth,
    today.getDate() - 14
).getFullYear().toString();
// Using a default select option prevents a jump in the width of the select element
var defaultSelectOption = document.createElement('option');
defaultSelectOption.textContent = currentYear;
elements.options.year.appendChild(defaultSelectOption);

var panToMarkers = true;
var popupOpen = false;

// Portraits settings
var portraitsBucketName = 'seniormap-portraits';

// All google sheet published urls. These can be found in the shared seniormap google drive.
var institutionDataSheetCoordinates = '2PACX-1vQnBlXwk6cpRpt-IVttNNCBvgySJl_JDVursNLtlB7IWtgTU5fBgldmFGudv-6oEwe-LeP8T-mzqylx/pub?gid=0';
var institutionDataSheetLogos = '2PACX-1vQnBlXwk6cpRpt-IVttNNCBvgySJl_JDVursNLtlB7IWtgTU5fBgldmFGudv-6oEwe-LeP8T-mzqylx/pub?gid=933441586';
var yearDocumentsSheetMain = '2PACX-1vRIX7bc0mlzPt-j5OWAIOYZsUEsrK5XWM_Q7hH4Zy-XSXkeP55CLXJv6vSRtZLZZ19v_OAA4yqzGCDU/pub?gid=0';
var yearDocumentsSheetStats = '2PACX-1vRIX7bc0mlzPt-j5OWAIOYZsUEsrK5XWM_Q7hH4Zy-XSXkeP55CLXJv6vSRtZLZZ19v_OAA4yqzGCDU/pub?gid=1838156495';
// README FLAG: A new year and datasheet URL must be added to this array for the script to access the data on the spreadsheet
var yearDocuments = new Map([
    ['2019', {
        sheetID: '2PACX-1vTe2fyt0NM0OYo1L03a3YLpJf065YBtK-gyUnM8gFnSfiRygSYm0LGJpRZv8SxTUs3Zaqx04wIk5LP3/pub?gid=579173246'
    }],
    ['2020', {
        sheetID: '2PACX-1vR3i4CkFe9kAaep1AiPzoQ_aoO5FgbHIpUT2YXxVgln4E3QscVM2Ve3xSAFBfpKS_3SLqxhQqpgeior/pub?gid=550355729'
    }],
    ['2021', {
        sheetID: '2PACX-1vRtb070z_anIOUPxB-srelTuhVUZtxKPSwF95ut9vwgst9J_JlW9-RoA1xF2dk4lm7YGayrrwrd5i12/pub?gid=421865614'
    }],
    ['2022', {
        sheetID: '2PACX-1vQ_Iy5L276joQEta-3MovmBmcZh2sh4WMhYzO-vzAQhzuY2S8eL2MPw7h3BCrQGahRtCWscNr34-CEh/pub?gid=1927517379'
    }]
]);
var stats = new Map();

var logos = new Map();  // Institution Name => Logo URL
var coordinates = new Map();  // Institution Name => { lat, lng }
var students = new Map();  // Year => List of students

// Called by Maps API upon loading.
function initMap() {
    definePopupClass();

    map = new google.maps.Map(elements.map, { // Define Map Settings
        center: {
            lat: 35,
            lng: -98
        },
        zoom: 4,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: true,
        backgroundColor: '#333333',
        styles: mapStyles
    });

    console.log('start');

    Promise.all([
        fetchYearDocuments(),
        fetchInstitutionData(),
        // Student data is fetched again in displayMap, so if the sheet ID
        // wasn't already in the students Map, the one from the yearDocument is used
        fetchStudentData(currentYear)
    ]).then(() => {
        
        displayMap(currentYear, true);
    });
}

async function fetchYearDocuments() {
    
    const papaMain = await fetchPapaData(yearDocumentsSheetMain);
    const papaStats = await fetchPapaData(yearDocumentsSheetStats);
    
    // Clear defaultSelectOption
    elements.options.year.innerHTML = '';
    for (let yearDocument of papaMain['data']) {
        yearDocuments.set(yearDocument['Year'].toString(), {
            sheetID: yearDocument['Datasheet URL'],
            formURL: yearDocument['Form URL']
        });

        let option = document.createElement('option');
        option.textContent = yearDocument['Year'];
        if (yearDocument['Year'] == currentYear) {
            option.selected = true;
        }

        elements.options.year.prepend(option);
    }

    for (let yearStats of papaStats['data']) {
        stats.set(yearStats['Year'], yearStats);
        delete yearStats['Year'];
    }
}

async function fetchInstitutionData() {
    const papaCoords = await fetchPapaData(institutionDataSheetCoordinates);
    const papaLogos = await fetchPapaData(institutionDataSheetLogos);
    // Turn 2D list into easily-subscriptable object
    for (let institution of papaCoords['data']) {
        coordinates.set(institution['Name'], {
            lat: parseFloat(institution['lat']),
            lng: parseFloat(institution['lng']),
        });
    }

    for (let logo of papaLogos['data']) {
        logos.set(logo['Name'], logo['Logo']);
    }
}

async function fetchStudentData(year) {
    
    if (students.has(year) || !yearDocuments.has(year)) {
        return;
    }

    const papa = await fetchPapaData(yearDocuments.get(year).sheetID);
    students.set(year, papa['data']);
}

function fetchPapaData(sheetID) {
    var fetchFunction = function fetchData(resolve, reject) {
        // Main parsing function to turn the csv from the internet into a nice js object.
        // Very helpful documentation can be found at https://www.papaparse.com/docs
        Papa.parse(`https://docs.google.com/spreadsheets/d/e/${sheetID}&single=true&output=csv`, {
            header: true,
            download: true,
            delimiter: ',',
            dynamicTyping: true,
            error: reject,
            // "complete:" is the callback when the parser finishes, and spits out its finished data (the data is stored in the 'papa' variable)
            complete: function(papa, _) {
                resolve(papa);
            }
        });
    }

    return new Promise(fetchFunction);
}

async function displayMap(year, firstLoad) {
    elements.map.classList.add('loading');
    clearPopups();
    hideStatisticsPanel();

    // Minimum delay of 750ms if not the first load
    await Promise.all([fetchStudentData(year), sleep(firstLoad ? 0 : 750)]);
    const institutions = buildInstitutionData(year);
    placeMarkers(institutions);
    loadStatistics(year, stats);

    elements.map.classList.remove('loading');
    if (yearDocuments.get(year).formURL) {
        elements.submitDestination.submitLink.href =
            yearDocuments.get(year).formURL;
        elements.submitDestination.submitYear.textContent = year;
    }
}

function clearPopups() {
    if (popup) popup.setMap(null);
}

function buildInstitutionData(year) {
    var institutions = {};
    for (student of students.get(year)) {
        if (!institutions[student['Institution name']]) { // If the institution isn't already in the object
            if (!coordinates.has(student['Institution name'])) {
                console.error('No location data found for Institution: ' + student['Institution name']);
            }

            institutions[student['Institution name']] = {
                name: student['Institution name'],
                students: [],
                position: coordinates.get(student['Institution name']),
            }
        }
        if(institutions[student['Institution name']].students.length < 1) {
            institutions[student['Institution name']].students.push({});
        }
        
    }

    for ([ institutionName, logoURL ] of logos) {
        if (institutions[institutionName]) {
            institutions[institutionName].logo = logoURL;
        }
    }

    return institutions;
}

function placeMarkers(institutions) {
    clearMarkers();

    for (name in institutions) {
        let marker = new google.maps.Marker(institutions[name]);
        google.maps.event.addListener(marker, 'click', function() {
            details(this);

            if (panToMarkers) {
                var scale = 1 / (1 << map.getZoom());
                var worldCoordinate = map.getProjection().fromLatLngToPoint(marker.position);
                var defaultOffset = 80 * scale;
                var offsetPerStudent = 40 * scale;

                worldCoordinate.y -= defaultOffset +
                    (offsetPerStudent * Math.min(5, this.students.length));
                worldCoordinate.y = Math.max(0, worldCoordinate.y);

                var latLng = map.getProjection().fromPointToLatLng(worldCoordinate);
                map.panTo(latLng);
            }
        });
        marker.setMap(map);
        markers.push(marker);
    }
    setMarkerPrecedence(elements.options.precedence.value == 'Bottom');
}

function clearMarkers() {
    for (marker of markers) {
        marker.setMap(null);
    }
    markers = [];
}

function details(institution) {
    clearPopups();
    
    var info = document.createElement('div');
    var institutionContainer = document.createElement('div');
    institutionContainer.className = 'institution-container';
    var institutionName = document.createElement('h3'),
        institutionLogo = document.createElement('img');
    institutionName.textContent = institution.name;
    institutionLogo.src = institution.logo || '';
    institutionLogo.alt = institution.name + ' Logo';
    institutionContainer.appendChild(institutionName);
    institutionContainer.appendChild(institutionLogo);
    info.appendChild(institutionContainer);
    var studentsList = document.createElement('div');
    studentsList.className = 'students-list';
    for (student of institution.students) {
        var studentPhoto = document.createElement('img'),
            studentName = document.createElement('p'),
            studentMajor = document.createElement('p');
        imageExists(studentPhoto.src, function(exists) {
            if (!exists) {
                studentPhoto.src = 'img/blankHead.png';
            }
        });
        studentPhoto.alt = student.name + ' portrait';
        studentPhoto.draggable = false;
        studentName.textContent = student.name;
        studentName.className = 'student-name';
        studentMajor.textContent = student.major;
        studentMajor.className = 'student-major';
        var studentContainer = document.createElement('div');
        studentContainer.className = 'student-container';
        // studentContainer.appendChild(studentPhoto);
        // studentContainer.appendChild(studentName);
        // studentContainer.appendChild(studentMajor);
        studentsList.appendChild(studentContainer);
        
    }
    info.appendChild(studentsList);
    info.style.setProperty('--num-columns', Math.ceil(studentsList.children.length / 5));
    popup = new Popup(new google.maps.LatLng(institution.position.lat(), institution.position.lng()), info);
    popup.setMap(map);
    
    console.log('Adding popup');
    popupOpen = true;
}

function imageExists(url, callback) {
    var img = new Image();
    img.onload = function() { callback(true); };
    img.onerror = function() { callback(false); };
    img.src = url;
}

var dragged = false;
var touchStartPositon = null;

onmousedown = onDragReset;
ontouchstart = onDragReset;

onmousemove = onDragStart;
ontouchmove = onDragStart;

onmouseup = onDragEnd;
ontouchend = onDragEnd;

function onDragReset(e) {
    dragged = false;
    if (e.touches) {
        touchStartPositon = [ e.touches[0].screenX, e.touches[0].screenY ];
    }
}

function onDragStart(e) {
    if (!touchStartPositon || !e.touches || e.touches.length < 1
        || Math.sqrt(Math.pow(touchStartPositon[0] - e.touches[0].screenX, 2)
            + Math.pow(touchStartPositon[1] - e.touches[0].screenY, 2)) > 50) {
        dragged = true;
    }
}

function onDragEnd(e) {
    // Check that we're not clicking a marker and that there was no dragging
    if (e.target.tagName != 'IMG'
        && dragged == false) {
        clearPopups();
    }
    dragged = false;
    touchStartPositon = null;
}

onkeydown = function(e) {
    if (e.key === 'Escape') {
        clearPopups();
    }
}

elements.options.year.addEventListener('change', function(event) {
    if (currentYear != event.target.value) {
        currentYear = event.target.value;
        displayMap(currentYear);
    }
});

elements.options.pan.addEventListener('click', function(event) {
    panToMarkers = event.target.checked;
});

elements.options.precedence.addEventListener('change', function(event) {
    setMarkerPrecedence(event.target.value == 'Bottom');
});

function setMarkerPrecedence(bottom) {
    let bottomMultiplier = bottom ? -1 : 1;

    let sortFunction = function(a, b) {
        let aPos = a.position || {lat: () => 0};
        let bPos = b.position || {lat: () => 0};

        return bottomMultiplier * (aPos.lat() - bPos.lat());
    };
    markers.sort(sortFunction);

    for (var i = 0; i < markers.length; i++) {
        markers[i].setZIndex(i);
    }
}

function transitionEnd(element, transitionProperty) {
    return new Promise(function(resolve, _) {
        var callback = function(event) {
            if (event.propertyName === transitionProperty) {
                element.removeEventListener('transitionend', callback);
                resolve();
            }
        };
        element.addEventListener('transitionend', callback);
    });
}

function sleep(millis) {
    return new Promise((resolve, _) => setTimeout(resolve, millis));
}

var mapStyles = [
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{
            color: '#222222'
        }]
    },
    {
        featureType: 'landscape',
        elementType: 'geometry',
        stylers: [{
            color: '#444444'
        }]
    },
    {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [
            {
                color: '#444444'
            },
            {
                lightness: -37
            }
        ]
    },
    {
        featureType: 'poi',
        elementType: 'geometry',
        stylers: [{
            color: '#666666'
        }]
    },
    {
        elementType: 'labels.text.stroke',
        stylers: [
            {
                visibility: 'on'
            },
            {
                color: '#666666'
            },
            {
                weight: 2
            },
            {
                gamma: 0.84
            }
        ]
    },
    {
        elementType: 'labels.text.fill',
        stylers: [{
            color: '#ffffff'
        }]
    },
    {
        featureType: 'administrative',
        elementType: 'geometry',
        stylers: [
            {
                weight: 0.6
            },
            {
                color: '#444444'
            }
        ]
    },
    {
        featureType: 'administrative.country',
        elementType: 'geometry',
        stylers: [{
            color: '#d12727'
        }]
    },
    {
        featureType: 'administrative.province',
        elementType: 'geometry',
        stylers: [{
            color: '#d12727'
        }]
    },
    {
        elementType: 'labels.icon',
        stylers: [{
            visibility: 'off'
        }]
    },
    {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{
            color: '#333333'
        }]
    },
    {
        featureType: 'poi.school',
        elementType: 'geometry',
        stylers: [{
            color: '#d12727'
        }]
    }
];
