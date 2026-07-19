import pandas as pd
import io
import tempfile
import os
import numpy as np
import logging
from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.views import LoginView, LogoutView
from django.urls import reverse_lazy
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import Node, Edge, Scenario
from .serializers import NodeSerializer, EdgeSerializer, ScenarioSerializer
from .cascade import cascade_update
from concurrent.futures import ThreadPoolExecutor
import uuid
import hashlib
from django.core.cache import cache

# Пул потоков (можно настроить под свои нужды)
executor = ThreadPoolExecutor(max_workers=2)

# Хранилище для задач (future объектов) по task_id
task_store = {}

logger = logging.getLogger(__name__)

# ---------- ИМПОРТ gCastle ----------
GCASTLE_AVAILABLE = False
castle = None

try:
    from gcastle import castle
    GCASTLE_AVAILABLE = True
    logger.info("✅ gCastle импортирован через 'from gcastle import castle'")
except ImportError:
    try:
        import castle
        GCASTLE_AVAILABLE = True
        logger.info("✅ gCastle импортирован через 'import castle'")
    except ImportError:
        try:
            from castle import castle as castle_alias
            castle = castle_alias
            GCASTLE_AVAILABLE = True
            logger.info("✅ gCastle импортирован через 'from castle import castle'")
        except ImportError as e:
            logger.error(f"❌ Не удалось импортировать gCastle: {e}")

ALGORITHMS = {
    'notears': {
        'class': 'Notears',
        'requires_normalization': True,
        'default_max_iter': 100,
        'description': 'NOTEARS (градиентный)'
    },
    'pc': {
        'class': 'PC',
        'requires_normalization': False,
        'default_max_iter': None,
        'description': 'PC (условная независимость)'
    },
    'ges': {
        'class': 'GES',
        'requires_normalization': False,
        'default_max_iter': None,
        'description': 'GES (жадный поиск)'
    },
    'golem': {
        'class': 'GOLEM',
        'requires_normalization': True,
        'default_max_iter': 100000,
        'description': 'GOLEM (устойчивый градиентный)'
    }
}

# ---------- СТРАНИЦЫ АУТЕНТИФИКАЦИИ ----------
def index(request):
    return render(request, 'index.html')

def registration(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect('index')
    else:
        form = UserCreationForm()
    return render(request, 'registration/register.html', {'form': form})

class CustomLoginView(LoginView):
    template_name = 'registration/login.html'

class CustomLogoutView(LogoutView):
    next_page = 'index'

# ---------- API: получение графа (только для текущего пользователя) ----------
@api_view(['GET'])
def get_graph(request):
    if request.user.is_authenticated:
        nodes = Node.objects.filter(user=request.user)
        edges = Edge.objects.filter(user=request.user)
    else:
        # Анонимный пользователь видит пустой холст
        nodes = Node.objects.none()
        edges = Edge.objects.none()
    return Response({
        'nodes': NodeSerializer(nodes, many=True).data,
        'edges': EdgeSerializer(edges, many=True).data,
    })

# ---------- API: каскад (с проверкой владельца) ----------
@api_view(['POST'])
def apply_cascade(request, node_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        node = Node.objects.get(id=node_id, user=request.user)
    except Node.DoesNotExist:
        return Response({'error': 'Node not found or permission denied'}, status=404)
    new_value = float(request.data.get('value', 0))
    changes, origins = cascade_update(node_id, new_value)
    return Response({
        'changes': changes,
        'origins': origins,
    })

# ---------- API: загрузка CSV ----------
@api_view(['POST'])
def upload_csv(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    if 'file' not in request.FILES:
        return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
    file = request.FILES['file']
    if not file.name.endswith('.csv'):
        return Response({'error': 'File must be CSV'}, status=status.HTTP_400_BAD_REQUEST)
    
    encodings = ['utf-8', 'cp1251', 'latin-1']
    df = None
    for enc in encodings:
        try:
            file.seek(0)
            content = file.read().decode(enc)
            df = pd.read_csv(io.StringIO(content), sep=None, engine='python')
            break
        except UnicodeDecodeError:
            continue
        except Exception:
            try:
                file.seek(0)
                content = file.read().decode(enc)
                df = pd.read_csv(io.StringIO(content), sep=';', engine='python')
                break
            except:
                continue
    if df is None:
        return Response({'error': 'Could not read CSV file.'}, status=400)
    
    if len(df.columns) == 1:
        for enc in encodings:
            try:
                file.seek(0)
                content = file.read().decode(enc)
                df = pd.read_csv(io.StringIO(content), sep=';', engine='python')
                if len(df.columns) > 1:
                    break
            except:
                continue
    if len(df.columns) == 1:
        return Response({'error': 'Could not parse CSV. Please use comma, semicolon, or tab.'}, status=400)
    
    session_key = request.session.session_key
    if not session_key:
        request.session.create()
        session_key = request.session.session_key
    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, f'uploaded_{session_key}.csv')
    df.to_csv(file_path, index=False)
    request.session['csv_file_path'] = file_path
    request.session['csv_columns'] = df.columns.tolist()
    
    columns = df.columns.tolist()
    dtypes = df.dtypes.astype(str).tolist()
    numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
    preview = df.head(5).to_dict(orient='records')
    
    return Response({
        'columns': columns,
        'dtypes': dtypes,
        'numeric_columns': numeric_columns,
        'preview': preview,
        'row_count': len(df),
    })

# ---------- Асинхронная задача (с передачей пользователя) ----------
def run_causal_discovery(file_path, columns, algorithm, threshold, max_iter, user):
    try:
        df = pd.read_csv(file_path)
        df_selected = df[columns].dropna()
        if len(df_selected) < 3:
            return {'error': 'Not enough rows after dropping NA (need at least 3).'}
        if ALGORITHMS[algorithm]['requires_normalization']:
            df_processed = (df_selected - df_selected.mean()) / df_selected.std()
        else:
            df_processed = df_selected
    except Exception as e:
        return {'error': f'Error preparing data: {str(e)}'}
    
    try:
        from castle.algorithms import Notears, PC, GES, GOLEM
        alg_map = {
            'notears': Notears,
            'pc': PC,
            'ges': GES,
            'golem': GOLEM
        }
        model_class = alg_map.get(algorithm)
        if model_class is None:
            return {'error': f'Algorithm {algorithm} not implemented'}
        
        if max_iter is not None:
            if algorithm == 'notears':
                model = model_class(max_iter=max_iter)
            elif algorithm == 'golem':
                model = model_class(num_iter=max_iter)
            else:
                model = model_class()
        else:
            model = model_class()
        
        logger.info(f"Запуск алгоритма {algorithm} (max_iter={max_iter if max_iter else 'default'})")
        model.learn(df_processed)
        causal_matrix = model.causal_matrix
        logger.info("Алгоритм завершил работу")
        
        import random
        random.seed(42)
        created_nodes = []
        for i, col in enumerate(columns):
            node = Node.objects.create(
                name=col,
                color='#%06x' % random.randint(0, 0xFFFFFF),
                x=random.randint(100, 800),
                y=random.randint(100, 500),
                value=0,
                transform_type='linear',
                transform_formula='',
                user=user  # привязываем к текущему пользователю
            )
            created_nodes.append(node)
        
        for i in range(len(columns)):
            for j in range(len(columns)):
                if i != j:
                    weight = abs(causal_matrix[i][j])
                    if weight > threshold:
                        Edge.objects.create(
                            source=created_nodes[i],
                            target=created_nodes[j],
                            weight=round(weight, 3),
                            user=user  # привязываем связь к пользователю
                        )
        
        nodes = Node.objects.filter(user=user)
        edges = Edge.objects.filter(user=user)
        result = {
            'nodes': NodeSerializer(nodes, many=True).data,
            'edges': EdgeSerializer(edges, many=True).data,
        }
        # Сохраняем в кэш (на 1 час)
        cache_key = hashlib.md5(
            f"{file_path}_{columns}_{algorithm}_{threshold}_{max_iter}_{user.id}".encode()
        ).hexdigest()
        cache.set(cache_key, result, 3600)
        return result
    except Exception as e:
        logger.error(f"Ошибка: {str(e)}")
        return {'error': f'Error: {str(e)}'}

@api_view(['GET'])
def get_task_result(request, task_id):
    future = task_store.get(task_id)
    if future is None:
        return Response({'error': 'Task not found'}, status=404)
    if not future.done():
        return Response({'status': 'processing'})
    try:
        result = future.result()
        if isinstance(result, dict) and 'error' in result:
            return Response({'status': 'error', 'error': result['error']}, status=200)
        return Response({'status': 'completed', 'result': result})
    except Exception as e:
        return Response({'status': 'error', 'error': str(e)}, status=200)

# ---------- API: автоматическое построение графа ----------
@api_view(['POST'])
def discover_graph(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    
    columns = request.data.get('columns', [])
    if not columns or len(columns) < 2:
        return Response({'error': 'At least 2 numeric columns required'}, status=400)
    
    algorithm = request.data.get('algorithm', 'notears').lower()
    threshold = float(request.data.get('threshold', 0.05))
    max_iter = request.data.get('max_iter')
    if max_iter is not None:
        try:
            max_iter = int(max_iter)
        except ValueError:
            max_iter = None
    
    file_path = request.session.get('csv_file_path')
    if not file_path or not os.path.exists(file_path):
        return Response({'error': 'No data uploaded. Please upload CSV first.'}, status=400)
    
    # Генерируем ключ кэша с учётом пользователя
    cache_key = hashlib.md5(
        f"{file_path}_{columns}_{algorithm}_{threshold}_{max_iter}_{request.user.id}".encode()
    ).hexdigest()
    
    cached_result = cache.get(cache_key)
    if cached_result:
        return Response(cached_result)
    
    # Создаём задачу, передаём пользователя
    task_id = str(uuid.uuid4())
    future = executor.submit(
        run_causal_discovery,
        file_path,
        columns,
        algorithm,
        threshold,
        max_iter,
        request.user
    )
    task_store[task_id] = future
    return Response({'task_id': task_id, 'status': 'processing'})

# ---------- CRUD для узлов (с проверкой владельца) ----------
@api_view(['POST'])
def create_node(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    serializer = NodeSerializer(data=request.data)
    if serializer.is_valid():
        node = serializer.save(user=request.user)
        return Response(NodeSerializer(node).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT'])
def update_node(request, node_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        node = Node.objects.get(id=node_id, user=request.user)
    except Node.DoesNotExist:
        return Response({'error': 'Node not found or permission denied'}, status=404)
    serializer = NodeSerializer(node, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
def delete_node(request, node_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        node = Node.objects.get(id=node_id, user=request.user)
    except Node.DoesNotExist:
        return Response({'error': 'Node not found or permission denied'}, status=404)
    node.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

# ---------- CRUD для связей (с проверкой владельца) ----------
@api_view(['POST'])
def create_edge(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    serializer = EdgeSerializer(data=request.data)
    if serializer.is_valid():
        edge = serializer.save(user=request.user)
        return Response(EdgeSerializer(edge).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT'])
def update_edge(request, edge_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        edge = Edge.objects.get(id=edge_id, user=request.user)
    except Edge.DoesNotExist:
        return Response({'error': 'Edge not found or permission denied'}, status=404)
    new_weight = request.data.get('weight')
    if new_weight is None:
        return Response({'error': 'weight required'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        edge.weight = float(new_weight)
        edge.save()
        serializer = EdgeSerializer(edge)
        return Response(serializer.data)
    except ValueError:
        return Response({'error': 'weight must be a number'}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
def delete_edge(request, edge_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        edge = Edge.objects.get(id=edge_id, user=request.user)
    except Edge.DoesNotExist:
        return Response({'error': 'Edge not found or permission denied'}, status=404)
    edge.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

# ---------- СЦЕНАРИИ (уже привязаны к пользователю) ----------
@api_view(['GET'])
def list_scenarios(request):
    if request.user.is_authenticated:
        scenarios = Scenario.objects.filter(user=request.user).order_by('-created_at')
    else:
        scenarios = Scenario.objects.none()
    serializer = ScenarioSerializer(scenarios, many=True)
    return Response(serializer.data)

@api_view(['POST'])
def save_scenario(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    name = request.data.get('name')
    description = request.data.get('description', '')
    if not name:
        return Response({'error': 'Name required'}, status=400)
    if Scenario.objects.filter(user=request.user, name=name).exists():
        return Response({'error': 'Scenario with this name already exists'}, status=400)
    nodes = Node.objects.filter(user=request.user)
    edges = Edge.objects.filter(user=request.user)
    data = {
        'nodes': NodeSerializer(nodes, many=True).data,
        'edges': EdgeSerializer(edges, many=True).data,
    }
    scenario = Scenario.objects.create(name=name, description=description, data=data, user=request.user)
    serializer = ScenarioSerializer(scenario)
    return Response(serializer.data, status=201)

@api_view(['PUT'])
def update_scenario(request, scenario_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        scenario = Scenario.objects.get(id=scenario_id, user=request.user)
    except Scenario.DoesNotExist:
        return Response({'error': 'Scenario not found or permission denied'}, status=404)
    name = request.data.get('name')
    description = request.data.get('description')
    if name:
        scenario.name = name
    if description is not None:
        scenario.description = description
    scenario.save()
    return Response(ScenarioSerializer(scenario).data)

@api_view(['DELETE'])
def delete_scenario(request, scenario_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        scenario = Scenario.objects.get(id=scenario_id, user=request.user)
    except Scenario.DoesNotExist:
        return Response({'error': 'Scenario not found or permission denied'}, status=404)
    scenario.delete()
    return Response(status=204)

@api_view(['POST'])
def load_scenario(request, scenario_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        scenario = Scenario.objects.get(id=scenario_id, user=request.user)
    except Scenario.DoesNotExist:
        return Response({'error': 'Scenario not found or permission denied'}, status=404)
    data = scenario.data
    # Удаляем текущие узлы и связи пользователя
    Node.objects.filter(user=request.user).delete()
    Edge.objects.filter(user=request.user).delete()
    node_map = {}
    for node_data in data['nodes']:
        node = Node.objects.create(
            id=node_data['id'],  # сохраняем id, чтобы связать с ребрами
            name=node_data['name'],
            color=node_data['color'],
            x=node_data['x'],
            y=node_data['y'],
            value=node_data['value'],
            transform_type=node_data.get('transform_type', 'linear'),
            transform_formula=node_data.get('transform_formula', ''),
            user=request.user
        )
        node_map[node.id] = node
    for edge_data in data['edges']:
        source = node_map.get(edge_data['source'])
        target = node_map.get(edge_data['target'])
        if source and target:
            Edge.objects.create(
                source=source,
                target=target,
                weight=edge_data['weight'],
                user=request.user
            )
    nodes = Node.objects.filter(user=request.user)
    edges = Edge.objects.filter(user=request.user)
    return Response({
        'nodes': NodeSerializer(nodes, many=True).data,
        'edges': EdgeSerializer(edges, many=True).data,
    })

@api_view(['GET'])
def export_scenario(request, scenario_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    try:
        scenario = Scenario.objects.get(id=scenario_id, user=request.user)
    except Scenario.DoesNotExist:
        return Response({'error': 'Scenario not found or permission denied'}, status=404)
    return Response(scenario.data)

@api_view(['POST'])
def import_scenario(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)
    data = request.data
    if 'nodes' not in data or 'edges' not in data:
        return Response({'error': 'Invalid data format'}, status=400)
    name = request.query_params.get('name', 'Imported scenario')
    description = request.query_params.get('description', '')
    if Scenario.objects.filter(user=request.user, name=name).exists():
        return Response({'error': 'Scenario with this name already exists'}, status=400)
    scenario = Scenario.objects.create(name=name, description=description, data=data, user=request.user)
    return Response(ScenarioSerializer(scenario).data, status=201)