# backend/papers/services.py
import requests
from django.conf import settings
from django.core.cache import cache
import time

# marker cached when an api answers that it has no record, so the miss is not looked up again
NOT_FOUND = '__not_found__'
# negative results get a shorter ttl than successes: a missing record can appear later
NOT_FOUND_TTL = 60*60*24

# enrichment lookups are retried once on a transient failure: 429, 5xx, timeout, connection error.
# crossref throttles at 1 request/second and sends 429 with no retry-after, so the delay is fixed.
HTTP_ATTEMPTS = 2
HTTP_TIMEOUT = 5
HTTP_RETRY_DELAY = 1.0

def fetch_with_retry(url):
    """GET url, retrying transient failures. Returns the response, or None if every attempt failed."""
    for attempt in range(HTTP_ATTEMPTS):
        try:
            response = requests.get(url, timeout=HTTP_TIMEOUT)
        except requests.exceptions.RequestException as e:
            print(f"Transient error requesting {url}: {e}")
        else:
            # 429 and 5xx are transient, everything else is an answer the caller can act on
            if response.status_code != 429 and response.status_code < 500:
                return response
            print(f"Transient status {response.status_code} from {url}")

        if attempt < HTTP_ATTEMPTS - 1:
            time.sleep(HTTP_RETRY_DELAY)

    return None

def enrich_results_with_doi(results):
    """Try to find DOIs for each result using CrossRef API"""
    for result in results:
        try:
            # cache key based on title to avoid repeated lookups
            cache_key = f"doi_lookup_{hash(result['title'])}"
            cached_doi = cache.get(cache_key)
            
            if cached_doi == NOT_FOUND:
                # crossref already said it has no match for this title
                continue
            
            if cached_doi:
                result['doi'] = cached_doi
                continue
                
            # use crossref api to find doi by title
            title = result['title']
            crossref_url = (
                f"https://api.crossref.org/works?query.title={requests.utils.quote(title)}"
                f"&rows=1&mailto={settings.CROSSREF_EMAIL}"
            )
            crossref_response = fetch_with_retry(crossref_url)
            
            if crossref_response is None:
                # transient failure, so cache nothing and let the next search retry
                continue
            
            if crossref_response.status_code == 200:
                data = crossref_response.json()
                items = data['message']['items']
                doi = items[0].get('DOI') if items else None
                if doi:
                    result['doi'] = doi
                    # cache the doi for future requests (1 week)
                    cache.set(cache_key, doi, 60*60*24*7)
                else:
                    # crossref answered and had no match, so cache the miss
                    cache.set(cache_key, NOT_FOUND, NOT_FOUND_TTL)
        except Exception as e:
            print(f"Error enriching result with DOI: {e}")
            continue

def enrich_results_with_unpaywall(results):
    """Add Unpaywall data for results that have DOIs"""
    for result in results:
        if 'doi' not in result:
            continue
            
        try:
            # check cache first
            cache_key = f"unpaywall_{result['doi']}"
            cached_data = cache.get(cache_key)
            
            if cached_data == NOT_FOUND:
                # unpaywall already said it has no record for this doi
                continue
            
            if cached_data:
                result['unpaywall'] = cached_data
                continue
                
            # call unpaywall api
            unpaywall_url = f"https://api.unpaywall.org/v2/{result['doi']}?email={settings.UNPAYWALL_EMAIL}"
            unpaywall_response = fetch_with_retry(unpaywall_url)
            
            if unpaywall_response is None:
                # transient failure, so cache nothing and let the next search retry
                continue
            
            if unpaywall_response.status_code == 200:
                unpaywall_data = unpaywall_response.json()
                
                # extract relevant data
                unpaywall_info = {
                    'is_oa': unpaywall_data.get('is_oa', False),
                    'oa_status': unpaywall_data.get('oa_status'),
                    'oa_url': None,
                    'pdf_url': None,
                    'journal': unpaywall_data.get('journal_name'),
                    'year': unpaywall_data.get('year'),
                    'publisher': unpaywall_data.get('publisher')
                }
                
                # try to get full text links
                if unpaywall_data.get('best_oa_location'):
                    unpaywall_info['oa_url'] = unpaywall_data['best_oa_location'].get('url')
                    unpaywall_info['pdf_url'] = unpaywall_data['best_oa_location'].get('url_for_pdf')
                
                result['unpaywall'] = unpaywall_info
                
                # cache for 1 day
                cache.set(cache_key, unpaywall_info, 60*60*24)
                
            elif unpaywall_response.status_code == 404:
                # unpaywall has no record for this doi, so cache the miss
                cache.set(cache_key, NOT_FOUND, NOT_FOUND_TTL)
                
        except Exception as e:
            print(f"Error fetching Unpaywall data: {e}")
            continue
