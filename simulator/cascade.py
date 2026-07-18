from .models import Node, Edge
import math
import sys
sys.setrecursionlimit(10000)

def safe_eval(expr, x):
    """Безопасно вычисляет математическое выражение с переменной x."""
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
      - origins: {node_id: [source_id1, source_id2, ...]}  # источники, вызвавшие изменение
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
        # Добавляем всех прямых потомков
        for edge in all_edges:
            if edge.source.id == nid and edge.target.id not in reachable:
                stack.append(edge.target.id)

    # Словарь для хранения вычисленных значений
    result = {}

    # Рекурсивная функция вычисления значения узла (с мемоизацией)
    def get_value(node_id):
        if node_id in result:
            return result[node_id]

        # Если это источник изменений
        if node_id == changed_node_id:
            result[node_id] = new_value
            return new_value

        # Если узел не достижим — оставляем его текущее значение
        if node_id not in reachable:
            result[node_id] = all_nodes[node_id].value
            return all_nodes[node_id].value

        # Вычисляем сумму вкладов от всех входящих рёбер
        total = 0.0
        for edge in incoming.get(node_id, []):
            parent_id = edge.source.id
            # Рекурсивно вычисляем значение родителя
            parent_value = get_value(parent_id)
            # Вычисляем сигнал, который родитель отправляет дальше
            parent_node = all_nodes[parent_id]
            signal = compute_signal(parent_node, result)  # result уже содержит вычисленные значения родителей
            total += signal * edge.weight

        result[node_id] = total
        return total

    # Вычисляем значения для всех достижимых узлов
    for nid in reachable:
        get_value(nid)

    # Формируем словари изменений и origins
    changes = {}
    origins = {}
    for nid in reachable:
        new_val = result.get(nid, all_nodes[nid].value)
        old_val = all_nodes[nid].value
        if abs(new_val - old_val) > 1e-9:
            changes[nid] = new_val
            # Определяем источники, которые повлияли на этот узел
            src_list = []
            for edge in incoming.get(nid, []):
                parent_id = edge.source.id
                # Если родитель изменился или это сам источник — он источник влияния
                if parent_id in changes or parent_id == changed_node_id:
                    src_list.append(parent_id)
            if src_list:
                origins[nid] = src_list

    # Сохраняем новые значения в БД
    for nid, val in result.items():
        if nid in all_nodes:
            node = all_nodes[nid]
            node.value = val
            node.save()

    return changes, origins