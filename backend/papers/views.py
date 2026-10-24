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
from .services import enrich_results_with_doi, enrich_results_with_unpaywall

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