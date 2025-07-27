/**
 * Geocoding service for address lookup
 * This is an optional enhancement that requires API keys
 */

class GeocodingService {
  constructor() {
    this.googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.enabled = !!this.googleApiKey;
  }

  /**
   * Enhance location data with real address lookup
   */
  async enhanceLocationData(locationDetails) {
    if (!this.enabled || !locationDetails) {
      return locationDetails;
    }

    try {
      // If we have a name but no address, try to find it
      if (locationDetails.name && !locationDetails.address) {
        const address = await this.searchPlace(locationDetails.name);
        if (address) {
          return {
            ...locationDetails,
            address: address.formatted_address,
            city: this.extractComponent(address, 'locality'),
            state: this.extractComponent(address, 'administrative_area_level_1'),
            country: this.extractComponent(address, 'country'),
            coordinates: address.geometry?.location
          };
        }
      }

      return locationDetails;
    } catch (error) {
      console.error('Geocoding error:', error);
      return locationDetails; // Return original data on error
    }
  }

  /**
   * Search for a place using Google Places API
   */
  async searchPlace(query) {
    if (!this.enabled) return null;

    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=formatted_address,geometry,name&key=${this.googleApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.candidates.length > 0) {
      return data.candidates[0];
    }

    return null;
  }

  /**
   * Extract address component from Google Places result
   */
  extractComponent(result, type) {
    const component = result.address_components?.find(comp => 
      comp.types.includes(type)
    );
    return component?.long_name || null;
  }
}

module.exports = GeocodingService;