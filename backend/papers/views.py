# backend/papers/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
import requests
from django.conf import settings
from django.core.cache import cache
import time
import json
from papers.models import PaperExtract

# marker cached when an api answers that it has no record, so the miss is not looked up again
NOT_FOUND = '__not_found__'
# negative results get a shorter ttl than successes: a missing record can appear later
NOT_FOUND_TTL = 60*60*24

# enrichment lookups are retried once on a transient failure: 429, 5xx, timeout, connection error.
# crossref throttles at 1 request/second and sends 429 with no retry-after, so the delay is fixed.
HTTP_ATTEMPTS = 2
HTTP_TIMEOUT = 5
HTTP_RETRY_DELAY = 1.0

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_scholar(request):
    """Search Google Scholar via SerpAPI with rate limiting"""
    query = request.GET.get('query', '')
    
    if not query:
        return Response({'error': 'Query parameter is required'}, status=400)
    
    # rate limiting - allow only one request per 5 seconds per user. Using free plan of serpapi
    user_id = request.user.id
    cache_key = f'scholar_search_{user_id}'
    last_request_time = cache.get(cache_key)
    
    if last_request_time and (time.time() - last_request_time) < 5:
        return Response({
            'error': 'Rate limit exceeded. Please wait a moment before trying again.'
        }, status=429)
    
    try:
        # record request time
        cache.set(cache_key, time.time(), 300)  # cache for 5 minutes
        
        # call serpapi
        api_url = "https://serpapi.com/search"
        params = {
            "engine": "google_scholar",
            "q": query,
            "api_key": settings.SERPAPI_KEY,
            "num": 20  # number of results
        }
        
        response = requests.get(api_url, params=params)
        
        if response.status_code != 200:
            error_data = response.json()
            return Response({
                'error': error_data.get('error', 'SerpAPI error')
            }, status=response.status_code)
        
        result_data = response.json()
        
        # enrich results with dois if possible
        if 'organic_results' in result_data:
            enrich_results_with_doi(result_data['organic_results'])
            # also add unpaywall data when doi is available
            enrich_results_with_unpaywall(result_data['organic_results'])
            
        return Response(result_data)
    
    except Exception as e:
        return Response({'error': str(e)}, status=500)

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

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_extract(request):
    """Save paper extract for authenticated user"""
    try:
        data = request.data
        user = request.user
        
        # Create new extract
        extract = PaperExtract.objects.create(
            user=user,
            title=data.get('title', ''),
            authors=data.get('authors', ''),
            publication_info=data.get('publication_info', ''),
            doi=data.get('doi'),
            link=data.get('link', ''),
            pdf_link=data.get('pdf_link', ''),
            publication_link=data.get('publication_link', ''),
            extract=data.get('extract', ''),
            page_number=data.get('page_number', ''),
            additional_info=data.get('additional_info', '')
        )
        
        return Response({
            'id': extract.id,
            'message': 'Extract saved successfully'
        }, status=201)
        
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_extracts(request):
    """Get all extracts for authenticated user"""
    try:
        extracts = PaperExtract.objects.filter(user=request.user)
        
        result = []
        for extract in extracts:
            result.append({
                'id': extract.id,
                'title': extract.title,
                'authors': extract.authors,
                'publication_info': extract.publication_info,
                'doi': extract.doi,
                'link': extract.link,
                'pdf_link': extract.pdf_link,
                'publication_link': extract.publication_link,
                'extract': extract.extract,
                'page_number': extract.page_number,
                'additional_info': extract.additional_info,
                'created_at': extract.created_at
            })
            
        return Response(result)
        
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_extract(request, extract_id):
    """Delete a specific extract"""
    try:
        extract = PaperExtract.objects.get(id=extract_id, user=request.user)
        extract.delete()
        return Response({'message': 'Extract deleted successfully'})
    except PaperExtract.DoesNotExist:
        return Response({'error': 'Extract not found or not owned by user'}, status=404)
    except Exception as e:
        return Response({'error': str(e)}, status=500)