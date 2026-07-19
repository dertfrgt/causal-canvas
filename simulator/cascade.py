from .models import Node, Edge
import math
import sys
sys.setrecursionlimit(10000)

def safe_eval(expr, x):
    allowed_names = {k: getattr(math, k) for k in dir(math) if not k.startswith('_')}
    allowed_names['x'] = x
    code = compile(expr, "<string>", "eval")
    for name in code.co_names:
        if name not in allowed_names:
            raise NameError(f"Запрещённое имя: {name}")
    return eval(code, {"__builtins__": {}}, allowed_names)


def compute_signal(node, value_dict):
    """
    Вычисляет исходящий сигнал узла на основе его значения из value_dict.
    value_dict — словарь {node_id: значение} для уже вычисленных узлов.
    """
    val = value_dict.get(node.id, node.value)
    t = node.transform_type
    if t == 'linear':
        return val
    elif t == 'quadratic':
        return val ** 2
    elif t == 'logarithmic':
        return math.log(val + 1) if val >= 0 else 0
    elif t == 'sinusoidal':
        return math.sin(val)
    elif t == 'custom' and node.transform_formula:
        try:
            return safe_eval(node.transform_formula, val)
        except Exception as e:
            print(f"Ошибка в формуле '{node.transform_formula}': {e}")
            return val
    return val


def cascade_update(changed_node_id, new_value):
    """
    Запускает каскадное обновление от changed_node_id.
    Возвращает:
      - changes: {node_id: новое_значение}
      - origins: {node_id: [source_id1, source_id2, ...]}
    """
    # Загружаем все узлы и рёбра
    all_nodes = {node.id: node for node in Node.objects.all()}
    all_edges = Edge.objects.all()

    # Построим список входящих рёбер для каждого узла (для быстрого доступа)
    incoming = {nid: [] for nid in all_nodes}
    for edge in all_edges:
        incoming[edge.target.id].append(edge)

    # Определяем множество узлов, достижимых от changed_node_id по направлению стрелок
    reachable = set()
    stack = [changed_node_id]
    while stack:
        nid = stack.pop()
        if nid in reachable:
            continue
        reachable.add(nid)
        for edge in all_edges:
            if edge.source.id == nid and edge.target.id not in reachable:
                stack.append(edge.target.id)

    # Словарь для хранения вычисленных значений
    current_values = {nid: all_nodes[nid].value for nid in all_nodes}
    # Обнуляем все значения, кроме источника
    for nid in reachable:
        if nid != changed_node_id:
            current_values[nid] = 0.0
    current_values[changed_node_id] = new_value

    changes = {}
    origins = {}

    # BFS для распространения
    queue = [changed_node_id]
    visited = set([changed_node_id])

    while queue:
        node_id = queue.pop(0)
        node = all_nodes[node_id]
        signal = compute_signal(node, current_values)

        for edge in incoming.get(node_id, []):  # исходящие рёбра
            target_id = edge.target.id
            if target_id in visited:
                continue
            # Добавляем вклад
            current_values[target_id] += signal * edge.weight
            changes[target_id] = current_values[target_id]
            if target_id not in origins:
                origins[target_id] = []
            origins[target_id].append(node_id)
            visited.add(target_id)
            queue.append(target_id)

    # Обновляем значения узлов в БД
    for node_id, val in current_values.items():
        if node_id in all_nodes:
            node = all_nodes[node_id]
            node.value = val
            node.save()

    # Формируем changes для всех изменённых узлов (включая источник)
    for nid in visited:
        if nid not in changes:
            changes[nid] = current_values[nid]

    return changes, origins