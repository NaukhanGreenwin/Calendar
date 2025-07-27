/**
 * Location Enhancement Service
 * Enhances location data with known addresses for common places
 */

class LocationEnhancer {
    constructor() {
        // Database of well-known locations with their addresses
        this.knownLocations = {
            // Toronto Landmarks
            'cn tower': {
                name: 'CN Tower',
                address: '290 Bremner Blvd, Toronto, ON M5V 3L9',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: true
            },
            'rogers centre': {
                name: 'Rogers Centre',
                address: '1 Blue Jays Way, Toronto, ON M5V 1J1',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: true
            },
            'union station': {
                name: 'Union Station Toronto',
                address: '65 Front St W, Toronto, ON M5J 1E6',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: true
            },
            'eaton centre': {
                name: 'CF Toronto Eaton Centre',
                address: '220 Yonge St, Toronto, ON M5B 2H1',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: true
            },
            'pearson airport': {
                name: 'Toronto Pearson International Airport',
                address: '6301 Silver Dart Dr, Mississauga, ON L5P 1B2',
                city: 'Mississauga',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: true
            },
            'casa loma': {
                name: 'Casa Loma',
                address: '1 Austin Terrace, Toronto, ON M5R 1X8',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: true
            },
            'harbourfront centre': {
                name: 'Harbourfront Centre',
                address: '235 Queens Quay W, Toronto, ON M5J 2G8',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: true
            },
            // Restaurant Chains
            'jack astors': {
                name: 'Jack Astor\'s Bar and Grill',
                address: 'Multiple locations in Toronto area',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: false
            },
            'the keg': {
                name: 'The Keg Steakhouse + Bar',
                address: 'Multiple locations in Toronto area',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: false
            },
            'swiss chalet': {
                name: 'Swiss Chalet',
                address: 'Multiple locations in Toronto area',
                city: 'Toronto',
                state: 'ON',
                country: 'Canada',
                isWellKnownPlace: false
            }
        };
    }

    /**
     * Enhance location details with known address information
     */
    enhanceLocation(locationDetails) {
        if (!locationDetails || !locationDetails.name) {
            return locationDetails;
        }

        const locationKey = locationDetails.name.toLowerCase();
        
        // Check for exact matches first
        if (this.knownLocations[locationKey]) {
            return {
                ...locationDetails,
                ...this.knownLocations[locationKey]
            };
        }

        // Check for partial matches
        for (const [key, knownLocation] of Object.entries(this.knownLocations)) {
            if (locationKey.includes(key) || key.includes(locationKey)) {
                return {
                    ...locationDetails,
                    ...knownLocation,
                    name: locationDetails.name // Keep original name
                };
            }
        }

        return locationDetails;
    }

    /**
     * Add a new location to the database
     */
    addLocation(key, locationData) {
        this.knownLocations[key.toLowerCase()] = locationData;
    }
}

module.exports = LocationEnhancer;